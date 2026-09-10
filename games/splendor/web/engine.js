import {CARDS, COLORS, TOKENS} from './data.js';
export {CARDS, COLORS, TOKENS};
export const emptyTokens = () => Object.fromEntries(TOKENS.map(c => [c, 0]));
export const total = tokens => TOKENS.reduce((n, c) => n + tokens[c], 0);
const clone = value => structuredClone(value);
const check = (ok, message) => { if (!ok) throw new Error(message); };
export function random() { return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; }
function shuffle(items, rng) {
  const result = clone(items);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function createGame(names, {rng = random, first = 0} = {}) {
  check(Array.isArray(names) && names.length >= 2 && names.length <= 4, '宝可梦版需要 2–4 位玩家。');
  check(Number.isInteger(first) && first >= 0 && first < names.length, '先手无效。');
  const count = [0, 0, 4, 5, 7][names.length];
  const decks = [1, 2, 3, 4, 5].map(tier => shuffle(CARDS.filter(c => c.tier === tier), rng));
  return {schema: 1, version: 0, turn: 0, current: first, first, phase: 'action', finalRound: false,
    bank: {...Object.fromEntries(COLORS.map(c => [c, count])), master: 5},
    market: decks.map((d,i) => d.splice(0, i < 3 ? 4 : 1)), decks,
    players: names.map((name, seat) => ({name, seat, tokens: emptyTokens(), bonuses: emptyTokens(),
      cards: [], reserved: [], evolved: [], points: 0})), winners: [], log: []};
}
export function price(player, card) {
  return Object.fromEntries(TOKENS.map(c => [c, Math.max(0, (card.cost[c] || 0) - (player.bonuses[c] || 0))]));
}
export function defaultPayment(player, card) {
  const due = price(player, card), payment = emptyTokens();
  payment.master = due.master;
  for (const c of COLORS) {
    payment[c] = Math.min(due[c], player.tokens[c]);
    payment.master += due[c] - payment[c];
  }
  return payment;
}
export const affordable = (player, card) => defaultPayment(player, card).master <= player.tokens.master;
export function evolutionActions(state, player = state.players[state.current]) {
  return player.cards.flatMap(from => {
    if (!from.evolvesToSpeciesId || !COLORS.every(c => player.bonuses[c] >= (from.evolveCost?.[c] || 0))) return [];
    return [...state.market.flat().filter(Boolean), ...player.reserved]
      .filter(to => to.speciesId === from.evolvesToSpeciesId && to.stage === from.stage + 1)
      .map(to => ({type: 'evolve', fromId: from.id, cardId: to.id}));
  });
}
function combinations(values, size) {
  if (size === 0) return [[]];
  return values.flatMap((value, i) => combinations(values.slice(i + 1), size - 1).map(rest => [value, ...rest]));
}
export function legalActions(state) {
  if (state.phase === 'complete') return [];
  const player = state.players[state.current];
  if (state.phase === 'return') return [{type: 'return', count: total(player.tokens) - 10}];
  if (state.phase === 'evolve') return [...evolutionActions(state), {type: 'finish'}];
  const available = COLORS.filter(c => state.bank[c] > 0), actions = [];
  if (available.length) for (const colors of combinations(available, Math.min(3, available.length))) actions.push({type: 'take', colors});
  for (const c of COLORS) if (state.bank[c] >= 4) actions.push({type: 'take', colors: [c, c]});
  for (const card of [...state.market.flat().filter(Boolean), ...player.reserved]) {
    if (affordable(player, card)) actions.push({type: 'buy', cardId: card.id});
  }
  if (player.reserved.length < 3) {
    for (const card of state.market.flat().filter(c => c?.kind === 'normal')) actions.push({type: 'reserve', cardId: card.id});
    for (let i = 0; i < 3; i++) if ((state.deckCounts?.[i] ?? state.decks?.[i]?.length) > 0) actions.push({type: 'reserve', tier: i + 1});
  }
  // A protocol escape for the degenerate position with no available main action.
  if (!actions.length) actions.push({type: 'pass'});
  return actions;
}
function tokenInput(value) {
  check(value && typeof value === 'object' && !Array.isArray(value), '请选择有效的筹码数量。');
  check(Object.keys(value).every(c => TOKENS.includes(c)), '筹码颜色无效。');
  const result = emptyTokens();
  for (const c of TOKENS) {
    const n = value[c] ?? 0;
    check(Number.isSafeInteger(n) && n >= 0 && n <= 40, '筹码数量必须是非负整数。');
    result[c] = n;
  }
  return result;
}
function record(state, text) {
  state.log.unshift({turn: state.turn, seat: state.current, text});
  state.log = state.log.slice(0, 30);
}
function finishTurn(state) {
  const player = state.players[state.current];
  if (player.points >= 18) state.finalRound = true;
  state.turn++;
  state.current = (state.current + 1) % state.players.length;
  if (state.finalRound && state.current === state.first) {
    state.phase = 'complete';
    const score = Math.max(...state.players.map(p => p.points));
    const candidates = state.players.filter(p => p.points === score);
    const mostEvolved = Math.max(...candidates.map(p => p.evolved.length));
    const evolved = candidates.filter(p => p.evolved.length === mostEvolved);
    const mostCards = Math.max(...evolved.map(p => p.cards.length));
    state.winners = evolved.filter(p => p.cards.length === mostCards).map(p => p.seat);
  } else state.phase = 'action';
}
function afterAction(state) {
  if (total(state.players[state.current].tokens) > 10) { state.phase = 'return'; return; }
  if (evolutionActions(state).length) state.phase = 'evolve';
  else finishTurn(state);
}
function removeMarket(state, id) {
  for (let tier = 0; tier < 5; tier++) {
    const slot = state.market[tier].findIndex(c => c?.id === id);
    if (slot >= 0) {
      const card = state.market[tier][slot];
      state.market[tier][slot] = state.decks[tier].shift() || null;
      return card;
    }
  }
  return null;
}
export function applyAction(original, seat, action) {
  check(original.phase !== 'complete', '本局已经结束。');
  check(seat === original.current, '还没有轮到你。');
  check(action && typeof action === 'object' && !Array.isArray(action), '行动无效。');
  const state = clone(original), player = state.players[seat];
  if (state.phase === 'return') {
    check(action.type === 'return', '请先归还超额筹码。');
    const returned = tokenInput(action.tokens);
    check(total(returned) === total(player.tokens) - 10, '请恰好归还超出 10 枚的部分。');
    for (const c of TOKENS) { check(returned[c] <= player.tokens[c], '不能归还未持有的筹码。'); player.tokens[c] -= returned[c]; state.bank[c] += returned[c]; }
    record(state, `归还 ${total(returned)} 枚筹码`); afterAction(state);
  } else if (state.phase === 'evolve') {
    if (action.type === 'finish') finishTurn(state);
    else {
      check(action.type === 'evolve' && evolutionActions(state).some(a => a.fromId === action.fromId && a.cardId === action.cardId), '请选择符合条件的进化。');
      const from = player.cards.splice(player.cards.findIndex(c => c.id === action.fromId), 1)[0];
      const reservedIndex = player.reserved.findIndex(c => c.id === action.cardId);
      const to = reservedIndex >= 0 ? player.reserved.splice(reservedIndex,1)[0] : removeMarket(state,action.cardId);
      player.evolved.push(from); player.cards.push(to);
      player.bonuses[from.bonus] -= from.bonusAmount;
      player.bonuses[to.bonus] += to.bonusAmount;
      player.points += to.points - from.points;
      record(state, `${from.nameZh} 进化为 ${to.nameZh}`);
      finishTurn(state);
    }
  } else {
    const legal = legalActions(state).some(a => a.type === action.type &&
      (a.type === 'take' ? Array.isArray(action.colors) && action.colors.length === a.colors.length && action.colors.every(c => COLORS.includes(c)) && [...a.colors].sort().every((c,i) => c === [...action.colors].sort()[i]) :
        a.type === 'buy' || a.type === 'reserve' ? a.cardId === action.cardId && a.tier === action.tier : a.type === 'pass'));
    check(legal, '这个行动当前不可用。');
    if (action.type === 'take') {
      for (const c of action.colors) { state.bank[c]--; player.tokens[c]++; }
      const names = {red:'红',blue:'蓝',black:'黑',pink:'粉',yellow:'黄'};
      record(state, `拿取 ${action.colors.map(c => names[c]).join('、')} 筹码`);
    } else if (action.type === 'reserve') {
      const card = action.cardId ? removeMarket(state, action.cardId) : state.decks[action.tier - 1].shift();
      player.reserved.push(card);
      const master = state.bank.master > 0;
      if (master) { state.bank.master--; player.tokens.master++; }
      record(state, `预留一张 ${card.tier} 级卡${master ? '，获得大师球' : ''}`);
    } else if (action.type === 'buy') {
      const reservedIndex = player.reserved.findIndex(c => c.id === action.cardId);
      const card = reservedIndex >= 0 ? player.reserved.splice(reservedIndex, 1)[0] : removeMarket(state, action.cardId);
      const due = price(player, card), payment = tokenInput(action.payment ?? defaultPayment(player, card));
      check(TOKENS.every(c => payment[c] <= player.tokens[c]), '支付超出了持有数量。');
      check(COLORS.every(c => payment[c] <= due[c]) && COLORS.reduce((n, c) => n + due[c] - payment[c], 0) + due.master === payment.master, '支付需要恰好覆盖折扣后的费用。');
      for (const c of TOKENS) { player.tokens[c] -= payment[c]; state.bank[c] += payment[c]; }
      player.cards.push(card); player.bonuses[card.bonus] += card.bonusAmount; player.points += card.points;
      record(state, `捕捉 ${card.nameZh}，奖杯 +${card.points}`);
    } else record(state, '无合法主动作，跳过');
    afterAction(state);
  }
  state.version++;
  return state;
}
export function projectGame(state, viewer) {
  // Construct the public view explicitly: never serialize deck order or other hands.
  return {schema: state.schema, version: state.version, turn: state.turn, current: state.current, first: state.first,
    phase: state.phase, finalRound: state.finalRound, bank: clone(state.bank), market: clone(state.market),
    deckCounts: state.decks.map(d => d.length), winners: [...state.winners], log: clone(state.log),
    players: state.players.map(p => ({...clone(p), evolved: p.seat === viewer ? clone(p.evolved) : p.evolved.map(() => ({hidden:true})), reserved: p.seat === viewer ? clone(p.reserved) : p.reserved.map(c => ({tier:c.tier, hidden:true}))}))};
}
export function assertConservation(state) {
  const initial = [0, 0, 4, 5, 7][state.players.length];
  for (const c of TOKENS) {
    check([state.bank, ...state.players.map(p => p.tokens)].every(t => Number.isInteger(t[c]) && t[c] >= 0), 'Invalid tokens');
    check(state.bank[c] + state.players.reduce((n, p) => n + p.tokens[c], 0) === (c === 'master' ? 5 : initial), 'Token conservation');
  }
  const cards = [...state.decks.flat(), ...state.market.flat().filter(Boolean), ...state.players.flatMap(p => [...p.cards, ...p.reserved, ...p.evolved])];
  check(cards.length === 90 && new Set(cards.map(c => c.id)).size === 90, 'Card conservation');
  for (const p of state.players) {
    check(p.reserved.length <= 3 && total(p.tokens) <= (p.seat === state.current && state.phase === 'return' ? 13 : 10), 'Player limits');
    check(p.points === p.cards.reduce((n, c) => n + c.points, 0), 'Score mismatch');
    check(COLORS.every(c => p.bonuses[c] === p.cards.filter(card => card.bonus === c).reduce((n,card) => n+card.bonusAmount,0)), 'Bonus mismatch');
  }
  return true;
}
