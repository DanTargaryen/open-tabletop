import {COLORS,TRACK,HOME,AIRPORTS,TAKEOFF,STARTS,planePoint,FINISH,legalPieces} from './engine.js';

export const planeIcon='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M14 5c0-5 4-5 4 0v7l11 8v3l-11-4v7l4 3v2l-6-2-6 2v-2l4-3v-7L3 23v-3l11-8Z" fill="currentColor" stroke="white" stroke-width="1.1" stroke-linejoin="round"/></svg>';
const xy=([x,y])=>[35+x*44,35+y*44];
export function drawBoard(element,players){
  const live=new Set(players.map(p=>p.color));
  let svg='<svg class="board-art" viewBox="0 0 686 686" aria-hidden="true"><defs><pattern id="paper-grid" width="44" height="44" patternUnits="userSpaceOnUse" x="13" y="13"><path d="M44 0H0V44" fill="none" stroke="#ddd8ca" stroke-width=".6"/></pattern></defs><rect x="8" y="8" width="670" height="670" rx="18" fill="#fcfaf3"/><rect x="13" y="13" width="660" height="660" fill="url(#paper-grid)"/>';
  for(let color=0;color<4;color++){
    const c=COLORS[color],[ax,ay]=xy(AIRPORTS[color]);
    svg+=`<g opacity="${live.has(color)?1:.3}"><rect x="${ax-20}" y="${ay-20}" width="216" height="216" rx="30" fill="${c.light}" stroke="${c.ink}" stroke-width="1.6"/><rect x="${ax-13}" y="${ay-13}" width="202" height="202" rx="25" fill="none" stroke="${c.ink}" opacity=".25"/><text x="${ax+88}" y="${ay+175}" text-anchor="middle" fill="${c.ink}" font-size="13" letter-spacing="3">— ${c.name}机队 —</text>`;
    for(let i=0;i<4;i++){const [x,y]=xy(planePoint(color,-1,i));svg+=`<circle cx="${x}" cy="${y}" r="27" fill="#fff" opacity=".55"/>`;}
    svg+='</g>';
    for(let i=0;i<6;i++){
      const [x,y]=xy(HOME[color][i]);
      svg+=`<rect x="${x-21}" y="${y-21}" width="42" height="42" rx="3" fill="${c.ink}" opacity=".8"/><circle cx="${x}" cy="${y}" r="14" fill="#fcfaf3" stroke="${c.ink}"/><text x="${x}" y="${y+4}" font-size="11" text-anchor="middle" fill="${c.ink}">${i===5?'✓':i+1}</text>`;
    }
  }
  TRACK.forEach((point,i)=>{const[x,y]=xy(point),c=COLORS[i%4];svg+=`<rect x="${x-21}" y="${y-21}" width="42" height="42" rx="5" fill="${c.light}" stroke="#d2cdc0" stroke-width=".7"/><circle cx="${x}" cy="${y}" r="15" fill="${c.ink}" opacity=".72"/><circle cx="${x}" cy="${y}" r="12.5" fill="none" stroke="#fff" opacity=".55"/>`;});
  for(let color=0;color<4;color++){
    const c=COLORS[color],[sx,sy]=xy(TRACK[(STARTS[color]+18)%52]),[ex,ey]=xy(TRACK[(STARTS[color]+30)%52]);
    svg+=`<path d="M${sx} ${sy}L${ex} ${ey}" fill="none" stroke="${c.ink}" stroke-width="2" stroke-dasharray="4 5"/><circle cx="${sx}" cy="${sy}" r="13" fill="${c.ink}"/><text x="${sx}" y="${sy+5}" text-anchor="middle" font-size="18" fill="white">✈</text>`;
    const [tx,ty]=xy(TAKEOFF[color]),[fx,fy]=xy(TRACK[STARTS[color]]);
    svg+=`<path d="M${tx} ${ty}L${fx} ${fy}" stroke="${c.ink}" stroke-width="1.2" stroke-dasharray="2 3" opacity=".5"/>`;
    svg+=`<circle cx="${tx}" cy="${ty}" r="19" fill="${c.light}" stroke="${c.ink}" stroke-dasharray="3 3"/><text x="${tx}" y="${ty+5}" font-size="15" text-anchor="middle" fill="${c.ink}">起</text>`;
  }
  svg+=`<g stroke="#fcfaf3" stroke-width="2"><path d="M321 321L365 321L343 343Z" fill="${COLORS[1].ink}"/><path d="M365 321L365 365L343 343Z" fill="${COLORS[2].ink}"/><path d="M365 365L321 365L343 343Z" fill="${COLORS[3].ink}"/><path d="M321 365L321 321L343 343Z" fill="${COLORS[0].ink}"/></g></svg>`;
  element.innerHTML=svg;
  for(const player of players)for(let i=0;i<4;i++){
    const button=document.createElement('button');button.className='plane';button.id=`plane-${player.id}-${i}`;button.dataset.player=player.id;button.dataset.piece=i;
    button.style.setProperty('--team',COLORS[player.color].ink);button.innerHTML=planeIcon+`<span>${i+1}</span>`;element.append(button);
  }
}
export function updatePlanes(element,s,canMove){
  const legal=legalPieces(s),groups=new Map();
  for(const player of s.players)player.planes.forEach((p,i)=>{
    const point=planePoint(player.color,p,i),key=point.join(',');
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push({player,p,i,point});
  });
  for(const group of groups.values())group.forEach(({player,p,i,point},offset)=>{
    const button=element.querySelector(`#plane-${player.id}-${i}`),[x,y]=xy(point),spread=group.length>1?13:0;
    button.style.left=`${(x+(offset%2-.5)*spread)/686*100}%`;
    button.style.top=`${(y+(Math.floor(offset/2)-.5)*spread)/686*100}%`;
    button.style.zIndex=String(3+offset);button.classList.toggle('arrived',p===FINISH);
    const enabled=canMove&&s.turn===player.id&&legal.includes(i);button.disabled=!enabled;button.classList.toggle('selectable',enabled);
    button.setAttribute('aria-label',`${player.name}，${COLORS[player.color].name} ${i+1} 号机，${p===-1?'在机场':p===FINISH?'已抵达':p===0?'待出发':`航程 ${p}`} ${enabled?'可移动':''}`);
  });
}
