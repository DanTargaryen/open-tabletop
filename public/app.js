const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const grid=document.querySelector('#game-grid');
const localGamePath=value=>typeof value==='string'&&/^\/games\/[a-z0-9-]+\/[a-z0-9.-]+$/.test(value)?value:null;
try{
 const response=await fetch('/games.json');if(!response.ok)throw Error('catalog');
 const games=await response.json();if(!Array.isArray(games))throw Error('catalog');
 grid.innerHTML=games.map((game,index)=>{
  const solo=localGamePath(game.solo),online=localGamePath(game.online);
  return `<article class="game-card"><div class="game-art" aria-hidden="true"><div class="felt-line"></div><span class="art-caption">A GOOD HAND IS WORTH YOUR TIME</span><div class="playing-card card-back"><span>OT</span></div><div class="playing-card card-king"><b>K<small>♠</small></b><i>♠</i></div><div class="playing-card card-ace"><b>A<small>♥</small></b><i>♥</i></div><div class="chip chip-one">20</div><div class="chip chip-two">50</div><span class="art-index">${String(index+1).padStart(2,'0')} / ${escape(game.category)}</span></div><div class="game-copy"><div class="eyebrow">${escape(game.subtitle)}</div><h3>${escape(game.title)}</h3><p class="game-description">${escape(game.description)}</p><div class="game-tags"><span>${escape(game.players)}</span><span>虚拟筹码</span></div><div class="game-actions">${online?`<a class="button primary" href="${online}">好友联机 <span aria-hidden="true">→</span></a>`:''}${solo?`<a class="button secondary" href="${solo}">单人练习</a>`:''}</div><p class="game-note">好友房使用当前运行的服务器，同一张牌桌各自保留底牌。</p></div></article>`;
 }).join('');
}catch{grid.innerHTML='<p class="loading">暂时无法读取游戏列表。可以刷新页面，或直接进入 <a href="/games/texas-holdem/online.html">德州扑克好友房</a>。</p>';}
