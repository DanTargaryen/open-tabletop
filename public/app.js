const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character]);

const grid = document.querySelector('#game-grid');
const localGamePath = value => typeof value === 'string' && /^\/games\/[a-z0-9-]+\/[a-z0-9.-]+$/.test(value) ? value : null;

const pokerArt = index => `
  <div class="game-art poker-art" aria-hidden="true">
    <div class="felt-line"></div>
    <div class="playing-card card-back"><span>OT</span></div>
    <div class="playing-card card-king"><b>K<small>♠</small></b><i>♠</i></div>
    <div class="playing-card card-ace"><b>A<small>♥</small></b><i>♥</i></div>
    <div class="chip chip-one">20</div>
    <span class="art-index">${String(index + 1).padStart(2, '0')} / 德州扑克</span>
  </div>`;

const arcaneArt = (index, category) => `
  <div class="game-art arcane-art" aria-hidden="true">
    <div class="arcane-stars"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <span class="art-caption">TRUST WHAT YOU SEE · QUESTION WHAT YOU WEAR</span>
    <div class="arcane-halo">
      <div class="arcane-ring ring-outer"></div>
      <div class="arcane-ring ring-inner"></div>
      <span class="sigil sigil-one">△</span><span class="sigil sigil-two">◇</span><span class="sigil sigil-three">☾</span>
      <div class="rune-orbit">
        ${[1, 2, 3, 4, 5, 6, 7, 8].map((number, runeIndex) => `<span class="rune-stone" style="--rune:${runeIndex}">${number}</span>`).join('')}
      </div>
      <div class="spellbook"><span class="book-rune">?</span><i></i><b>ARCANA</b></div>
    </div>
    <span class="arcane-whisper">THE ANSWER RESTS ABOVE YOUR BROW</span>
    <span class="art-index">${String(index + 1).padStart(2, '0')} / ${escape(category)}</span>
  </div>`;

const pokemonArt = (index, category) => `
  <div class="game-art" aria-hidden="true"><div class="felt-line"></div>
    <div class="pokemon-team"><img src="/games/splendor/assets/pokemon/003-venusaur.svg" alt="" width="32" height="32"><img src="/games/splendor/assets/pokemon/006-charizard.svg" alt="" width="32" height="32"><img src="/games/splendor/assets/pokemon/009-blastoise.svg" alt="" width="32" height="32"></div>
    <span class="art-index">${String(index + 1).padStart(2, '0')} / ${escape(category)}</span>
  </div>`;

const fallbackArt = (index, category) => `
  <div class="game-art fallback-art" aria-hidden="true">
    <div class="felt-line"></div>
    <span class="art-caption">A NEW PLACE AT THE TABLE</span>
    <span class="fallback-piece">◇</span>
    <span class="art-index">${String(index + 1).padStart(2, '0')} / ${escape(category)}</span>
  </div>`;

const presentations = {
  'texas-holdem': {
    className: 'game-card--poker',
    art: pokerArt,
    extraTag: '虚拟筹码 · AI 补位',
    description: '六席德州扑克牌桌。读懂对手，选择跟注、加注或弃牌。',
    soloLabel: '单人练习',
    onlineLabel: '好友联机',
    note: '好友房也能一个人开始，空位自动补 AI。',
  },
  splendor: {
    className: 'pokemon-entry',
    art: pokemonArt,
    extraTag: '18 分 · 进化玩法',
    description: '收集精灵球、捕捉宝可梦，再用进化提升队伍实力。',
    note: '好友房也能一个人开始，空位自动补 AI。',
  },
  'abracada-what': {
    className: 'game-card--arcane',
    art: arcaneArt,
    extraTag: '积分模式 / 单局模式',
    soloLabel: '单人练习',
    onlineLabel: '好友联机',
    note: '本地规则 AI 自动补位；每位对手只根据自己合法可见的信息推理。',
  },
};

try {
  const response = await fetch('/games.json');
  if (!response.ok) throw Error('catalog');
  const games = await response.json();
  if (!Array.isArray(games) || !games.length) throw Error('catalog');

  grid.innerHTML = games.map((game, index) => {
    const solo = localGamePath(game.solo);
    const online = localGamePath(game.online);
    const presentation = presentations[game.id] ?? {
      className: 'game-card--default',
      art: fallbackArt,
      extraTag: '浏览器即玩',
      soloLabel: '开始游戏',
      onlineLabel: '好友联机',
      note: '无需下载客户端，在浏览器里坐下就好。',
    };

    return `<article class="game-card ${presentation.className}" aria-labelledby="game-${escape(game.id)}">
      ${presentation.art(index, game.category)}
      <div class="game-copy">
        <div class="eyebrow">${escape(game.subtitle)}</div>
        <h3 id="game-${escape(game.id)}">${escape(game.title)}</h3>
        <p class="game-description">${escape(presentation.description ?? game.description)}</p>
        <div class="game-tags"><span>${escape(game.players)}</span><span>${escape(presentation.extraTag)}</span></div>
        <div class="game-actions">
          ${solo ? `<a class="button primary" href="${solo}" aria-label="${escape(game.title)}单人模式">单人模式 <span aria-hidden="true">→</span></a>` : ''}
          ${online ? `<a class="button secondary" href="${online}" aria-label="${escape(game.title)}好友房">好友房 <span aria-hidden="true">↗</span></a>` : ''}
        </div>
        <p class="game-note">${escape(presentation.note)}</p>
      </div>
    </article>`;
  }).join('');
} catch {
  grid.innerHTML = '<p class="loading">暂时无法读取游戏列表，你仍可直接进入：<br><a href="/games/texas-holdem/index.html">丝绒牌局 · 单人</a> / <a href="/games/texas-holdem/online.html">丝绒牌局 · 好友房</a> / <a href="/games/splendor/index.html">璀璨宝石 · 宝可梦特别款 · 单人</a> / <a href="/games/splendor/online.html">璀璨宝石 · 宝可梦特别款 · 好友房</a> / <a href="/games/abracada-what/index.html">出包魔法师 · 单人</a> / <a href="/games/abracada-what/online.html">出包魔法师 · 好友房</a></p>';
}
