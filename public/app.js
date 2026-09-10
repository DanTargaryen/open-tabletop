const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const grid=document.querySelector('#game-grid');
const localGamePath=value=>typeof value==='string'&&/^\/games\/[a-z0-9-]+\/[a-z0-9.-]+$/.test(value)?value:null;
const directLinks='<a href="/games/texas-holdem/index.html">德州扑克 · 单人</a> / <a href="/games/texas-holdem/online.html">德州扑克 · 好友房</a> / <a href="/games/splendor/index.html">宝可梦 · 单人</a> / <a href="/games/splendor/online.html">宝可梦 · 好友房</a>';
try{
 const response=await fetch('/games.json');if(!response.ok)throw Error('catalog');
 const games=await response.json();if(!Array.isArray(games)||!games.length)throw Error('catalog');
 grid.innerHTML=games.map((game,index)=>{
  const solo=localGamePath(game.solo),online=localGamePath(game.online),pokemon=game.id==='splendor';
  const art=pokemon?`<div class="pokemon-team"><img src="/games/splendor/assets/pokemon/003-venusaur.svg" alt="" width="32" height="32"><img src="/games/splendor/assets/pokemon/006-charizard.svg" alt="" width="32" height="32"><img src="/games/splendor/assets/pokemon/009-blastoise.svg" alt="" width="32" height="32"></div>`:'<div class="playing-card card-back"><span>OT</span></div><div class="playing-card card-king"><b>K<small>♠</small></b><i>♠</i></div><div class="playing-card card-ace"><b>A<small>♥</small></b><i>♥</i></div><div class="chip">20</div>';
  return `<article class="game-card ${pokemon?'pokemon-entry':''}" aria-labelledby="game-${escape(game.id)}"><div class="game-art" aria-hidden="true"><div class="felt-line"></div>${art}<span class="art-index">${String(index+1).padStart(2,'0')} / ${escape(game.category)}</span></div><div class="game-copy"><div class="eyebrow">${escape(game.subtitle)}</div><h3 id="game-${escape(game.id)}">${escape(game.title)}</h3><p class="game-description">${pokemon?'收集精灵球、捕捉宝可梦，再用进化提升队伍实力。':'六席德州扑克牌桌。读懂对手，选择跟注、加注或弃牌。'}</p><div class="game-tags"><span>${escape(game.players)}</span><span>${pokemon?'18 分 · 进化玩法':'虚拟筹码 · AI 补位'}</span></div><div class="game-actions">${solo?`<a class="button primary" href="${solo}" aria-label="${escape(pokemon?'宝可梦':game.category)}单人模式">单人模式 <span aria-hidden="true">→</span></a>`:''}${online?`<a class="button secondary" href="${online}" aria-label="${escape(pokemon?'宝可梦':game.category)}好友房">好友房 <span aria-hidden="true">↗</span></a>`:''}</div><p class="game-note">好友房也能一个人开始，空位自动补 AI。</p></div></article>`;
 }).join('');
}catch{grid.innerHTML=`<p class="loading">暂时无法读取游戏列表，你仍可直接进入：<br>${directLinks}</p>`;}
