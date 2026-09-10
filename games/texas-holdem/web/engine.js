/* Velvet Poker — deterministic, dependency-free no-limit hold'em engine.
 * Card codes: As Kd Qh Jc Td ... 2c. Raises always specify a street total.
 * Betting/odd-chip conventions follow Poker TDA 2024 rules 20, 43 and 47.
 * https://www.pokertda.com/view-poker-tda-rules/
 * The public view and AI input never contain opponents' concealed cards.
 */

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';
export const HAND_NAMES = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];
export const DECK = Object.freeze([...SUITS].flatMap(suit => [...RANKS].map(rank => rank + suit)));
const RANK_VALUE = Object.fromEntries([...RANKS].map((rank, index) => [rank, index + 2]));
const SUIT_SYMBOL = { c: '♣', d: '♦', h: '♥', s: '♠' };
const PHASE_NAMES = { preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌' };
const LIVE_PHASES = new Set(['preflop', 'flop', 'turn', 'river']);
const BLIND_LEVELS = [[10, 20], [15, 30], [25, 50], [40, 80], [60, 120], [100, 200], [150, 300], [250, 500], [400, 800], [600, 1200], [1000, 2000], [1500, 3000], [2500, 5000], [4000, 8000], [8000, 16000]];
export const PERSONALITIES = Object.freeze([
  { brand: 'doubao', name: '豆包', label: '轻松稳健', style: 'balanced', tightness: .04, aggression: .58, bluff: .10, sticky: .00 },
  { brand: 'chatgpt', name: 'ChatGPT', label: '灵活应变', style: 'loose', tightness: -.055, aggression: .65, bluff: .18, sticky: .05 },
  { brand: 'claude', name: 'Claude', label: '温和谨慎', style: 'tight', tightness: .075, aggression: .49, bluff: .05, sticky: -.015 },
  { brand: 'glm', name: 'GLM', label: '主动果断', style: 'aggressive', tightness: -.005, aggression: .82, bluff: .20, sticky: .02 },
  { brand: 'deepseek', name: 'DeepSeek', label: '沉着推演', style: 'tricky', tightness: .025, aggression: .63, bluff: .16, sticky: .00 },
]);

export function cardRank(card) { return RANK_VALUE[card?.[0]] || 0; }
export function cardSuit(card) { return card?.[1] || ''; }
export function cardLabel(card) { return card ? `${card[0] === 'T' ? '10' : card[0]}${SUIT_SYMBOL[card[1]] || ''}` : ''; }
const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function assertCards(cards, min, max) {
  if (!Array.isArray(cards) || cards.length < min || cards.length > max || new Set(cards).size !== cards.length || cards.some(card => typeof card !== 'string' || !/^[2-9TJQKA][cdhs]$/.test(card))) {
    throw new Error(`需要 ${min}–${max} 张不重复的标准扑克牌。`);
  }
}

function straightHigh(ranks) {
  const unique = new Set(ranks);
  if (unique.has(14)) unique.add(1);
  let run = 0;
  for (let rank = 14; rank >= 1; rank--) {
    run = unique.has(rank) ? run + 1 : 0;
    if (run === 5) return rank + 4;
  }
  return 0;
}

// Direct best-five selection is equivalent to evaluating every 5-card subset,
// while making equity sampling fast enough to run between animation frames.
function evaluateUnchecked(cards) {
  const byRank = Array.from({ length: 15 }, () => []);
  const bySuit = { c: [], d: [], h: [], s: [] };
  for (const card of cards) {
    byRank[RANK_VALUE[card[0]]].push(card);
    bySuit[card[1]].push(card);
  }
  const ranks = [];
  for (let rank = 14; rank >= 2; rank--) if (byRank[rank].length) ranks.push(rank);
  const groups = [...ranks].sort((a, b) => byRank[b].length - byRank[a].length || b - a);
  const flush = Object.values(bySuit).find(group => group.length >= 5);
  const runCards = (pool, high) => Array.from({ length: 5 }, (_, index) => {
    const rank = high - index === 1 ? 14 : high - index;
    return pool.find(card => RANK_VALUE[card[0]] === rank);
  });
  const result = (category, values, selected) => ({ category, rank: [category, ...values], name: category === 8 && values[0] === 14 ? '皇家同花顺' : HAND_NAMES[category], cards: selected });
  if (flush) {
    const high = straightHigh(flush.map(card => RANK_VALUE[card[0]]));
    if (high) return result(8, [high], runCards(flush, high));
  }
  if (byRank[groups[0]].length === 4) {
    const quad = groups[0], kicker = ranks.find(rank => rank !== quad);
    return result(7, [quad, kicker], [...byRank[quad], byRank[kicker][0]]);
  }
  const trip = groups.find(rank => byRank[rank].length >= 3);
  const pairForHouse = trip && ranks.find(rank => rank !== trip && byRank[rank].length >= 2);
  if (trip && pairForHouse) return result(6, [trip, pairForHouse], [...byRank[trip].slice(0, 3), ...byRank[pairForHouse].slice(0, 2)]);
  if (flush) {
    const selected = [...flush].sort((a, b) => RANK_VALUE[b[0]] - RANK_VALUE[a[0]]).slice(0, 5);
    return result(5, selected.map(card => RANK_VALUE[card[0]]), selected);
  }
  const high = straightHigh(ranks);
  if (high) return result(4, [high], runCards(cards, high));
  if (trip) {
    const kickers = ranks.filter(rank => rank !== trip).slice(0, 2);
    return result(3, [trip, ...kickers], [...byRank[trip].slice(0, 3), ...kickers.map(rank => byRank[rank][0])]);
  }
  const pairs = ranks.filter(rank => byRank[rank].length === 2);
  if (pairs.length >= 2) {
    const top = pairs.slice(0, 2), kicker = ranks.find(rank => !top.includes(rank));
    return result(2, [...top, kicker], [...byRank[top[0]], ...byRank[top[1]], byRank[kicker][0]]);
  }
  if (pairs.length) {
    const pair = pairs[0], kickers = ranks.filter(rank => rank !== pair).slice(0, 3);
    return result(1, [pair, ...kickers], [...byRank[pair], ...kickers.map(rank => byRank[rank][0])]);
  }
  const top = ranks.slice(0, 5);
  return result(0, top, top.map(rank => byRank[rank][0]));
}

export function evaluateHand(cards) {
  assertCards(cards, 5, 7);
  return evaluateUnchecked(cards);
}

export function compareHands(left, right) {
  const a = Array.isArray(left) ? left : left.rank;
  const b = Array.isArray(right) ? right : right.rank;
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    if ((a[index] || 0) !== (b[index] || 0)) return Math.sign((a[index] || 0) - (b[index] || 0));
  }
  return 0;
}

/** Monte Carlo equity against uniformly sampled unknown hands; split pots count
 * fractionally. No game instance, deck order, folded cards, or bot holes enter.
 * rng is an optional independent deterministic source for reproducible testing.
 */
export function estimateEquity(knownHole, board = [], opponents = 1, iterations = 160, rng = Math.random) {
  assertCards(knownHole, 2, 2);
  assertCards(board, 0, 5);
  assertCards([...knownHole, ...board], 2, 7);
  if (!Number.isInteger(opponents) || opponents < 0 || opponents > 5) throw new Error('对手数量必须为 0–5。');
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100000) throw new Error('采样次数无效。');
  if (opponents === 0) return 1;
  const known = new Set([...knownHole, ...board]);
  const unknown = DECK.filter(card => !known.has(card));
  const needed = 5 - board.length + opponents * 2;
  let score = 0;
  for (let iteration = 0; iteration < iterations; iteration++) {
    const pool = [...unknown];
    for (let index = 0; index < needed; index++) {
      const selected = index + Math.floor(rng() * (pool.length - index));
      [pool[index], pool[selected]] = [pool[selected], pool[index]];
    }
    const community = [...board, ...pool.slice(0, 5 - board.length)];
    const hero = evaluateUnchecked([...knownHole, ...community]);
    let tied = 1, lost = false;
    for (let opponent = 0; opponent < opponents; opponent++) {
      const offset = 5 - board.length + opponent * 2;
      const comparison = compareHands(hero, evaluateUnchecked([pool[offset], pool[offset + 1], ...community]));
      if (comparison < 0) { lost = true; break; }
      if (comparison === 0) tied++;
    }
    if (!lost) score += 1 / tied;
  }
  return score / iterations;
}

function hashSeed(value) {
  const string = String(value);
  let hash = 2166136261;
  for (let index = 0; index < string.length; index++) { hash ^= string.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return hash >>> 0 || 1;
}

function randomSeed() {
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  return `${Date.now()}-${Math.random()}`;
}

function randomStep(state) {
  let value = state >>> 0;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  return value >>> 0 || 1;
}

const EMPTY_LEGAL = Object.freeze({ canFold: false, canCheck: false, canCall: false, canRaise: false, canAllIn: false, callAmount: 0, minRaiseTo: 0, maxRaiseTo: 0, allInTo: 0 });

export class PokerGame {
  constructor({ mode = 'tournament', difficulty = 'standard', seed, playerName = '你' } = {}) {
    if (!['tournament', 'practice'].includes(mode)) throw new Error('未知游戏模式。');
    if (!['casual', 'standard', 'expert'].includes(difficulty)) throw new Error('未知难度。');
    const actualSeed = seed ?? randomSeed();
    this._s = {
      schemaVersion: 1, mode, difficulty, seed: String(actualSeed), rng: hashSeed(actualSeed), aiRng: hashSeed(`ai-${actualSeed}`),
      phase: 'ready', handNumber: 0, dealerIndex: -1, smallBlindIndex: -1, bigBlindIndex: -1, currentPlayerIndex: -1,
      currentBet: 0, minRaise: 20, board: [], deck: [], burns: [], blinds: { small: 10, big: 20, level: 1 },
      totalChips: 12000, gameOver: false, winnerId: null, humanRank: null, history: [], handHistory: [], historyId: 0, lastResult: null,
      sessionStats: { handsPlayed: 0, handsWon: 0, showdowns: 0, biggestPot: 0, netChips: 0, currentWinStreak: 0, bestWinStreak: 0, raises: 0, folds: 0, vpipCount: 0, preflopRaiseCount: 0, bestHand: null },
      players: Array.from({ length: 6 }, (_, id) => ({
        id, name: id === 0 ? String(playerName).slice(0, 24) || '你' : PERSONALITIES[id - 1].name,
        personality: id === 0 ? '玩家' : PERSONALITIES[id - 1].label,
        style: id === 0 ? 'human' : PERSONALITIES[id - 1].style,
        isHuman: id === 0, stack: 2000, startingStack: 2000, bet: 0, contribution: 0, hole: [],
        folded: false, allIn: false, eliminated: false, rank: null, lastAction: '', winnings: 0,
        actedAt: null, reopenSize: 20, vpip: false, pfr: false,
      })),
    };
  }

  _random(ai = false) {
    const key = ai ? 'aiRng' : 'rng';
    this._s[key] = randomStep(this._s[key]);
    return this._s[key] / 4294967296;
  }

  _nextSeat(from, predicate = player => !player.eliminated) {
    for (let step = 1; step <= 6; step++) {
      const id = ((from + step) % 6 + 6) % 6;
      if (predicate(this._s.players[id])) return id;
    }
    return -1;
  }

  _log(text, type = 'info', playerId, amount) {
    const entry = { id: ++this._s.historyId, handNumber: this._s.handNumber, phase: this._s.phase, text, type };
    if (playerId !== undefined) entry.playerId = playerId;
    if (amount !== undefined) entry.amount = amount;
    this._s.history.push(entry);
    this._s.handHistory.push(entry);
    if (this._s.history.length > 160) this._s.history.shift();
  }

  _pay(player, amount) {
    const paid = Math.min(player.stack, amount);
    player.stack -= paid; player.bet += paid; player.contribution += paid;
    if (player.stack === 0) player.allIn = true;
    return paid;
  }

  _livePlayers() { return this._s.players.filter(player => !player.eliminated && !player.folded); }
  _actors() { return this._livePlayers().filter(player => !player.allIn && player.stack > 0); }
  get pot() { return this._s.players.reduce((sum, player) => sum + player.contribution, 0); }

  startHand() {
    const s = this._s;
    if (LIVE_PHASES.has(s.phase)) throw new Error('当前手牌尚未结束。');
    if (s.gameOver) throw new Error('本场比赛已结束，请开始新比赛。');
    if (s.mode === 'practice') {
      for (const player of s.players) { player.stack = 2000; player.eliminated = false; player.rank = null; }
    }
    if (s.players.filter(player => player.stack > 0).length < 2) throw new Error('需要至少两名玩家。');
    s.handNumber++;
    const level = s.mode === 'practice' ? 0 : Math.min(Math.floor((s.handNumber - 1) / 10), BLIND_LEVELS.length - 1);
    s.blinds = { small: BLIND_LEVELS[level][0], big: BLIND_LEVELS[level][1], level: level + 1 };
    s.phase = 'preflop'; s.board = []; s.burns = []; s.currentBet = s.blinds.big; s.minRaise = s.blinds.big;
    s.lastResult = null; s.handHistory = [];
    for (const player of s.players) {
      player.eliminated = player.stack === 0;
      Object.assign(player, { startingStack: player.stack, bet: 0, contribution: 0, hole: [], folded: player.eliminated, allIn: false, lastAction: '', winnings: 0, actedAt: null, reopenSize: s.blinds.big, vpip: false, pfr: false });
    }
    const headsUp = this._livePlayers().length === 2;
    if (s.handNumber === 1) {
      s.dealerIndex = this._nextSeat(-1);
      s.smallBlindIndex = headsUp ? s.dealerIndex : this._nextSeat(s.dealerIndex);
      s.bigBlindIndex = this._nextSeat(s.smallBlindIndex);
    } else {
      // Dead-button tournament movement: the big blind advances to the next
      // live seat. A busted prior BB leaves a dead SB for one hand, and a
      // busted prior SB can leave the button on an empty seat. In heads-up,
      // choose the button/SB from the new BB to prevent two consecutive BBs.
      const oldBigBlind = s.bigBlindIndex, oldSmallBlind = s.smallBlindIndex;
      s.bigBlindIndex = this._nextSeat(oldBigBlind);
      if (headsUp) {
        s.dealerIndex = this._nextSeat(s.bigBlindIndex);
        s.smallBlindIndex = s.dealerIndex;
      } else {
        s.smallBlindIndex = oldBigBlind;
        s.dealerIndex = oldSmallBlind;
      }
    }
    s.deck = [...DECK];
    for (let index = s.deck.length - 1; index > 0; index--) {
      const selected = Math.floor(this._random() * (index + 1));
      [s.deck[index], s.deck[selected]] = [s.deck[selected], s.deck[index]];
    }
    for (let round = 0; round < 2; round++) {
      let id = this._nextSeat(s.dealerIndex);
      for (let dealt = 0; dealt < this._livePlayers().length; dealt++) {
        s.players[id].hole.push(s.deck.pop());
        id = this._nextSeat(id);
      }
    }
    this._log(`第 ${s.handNumber} 手 · 盲注 ${s.blinds.small} / ${s.blinds.big}`, 'hand');
    for (const [id, amount, label] of [[s.smallBlindIndex, s.blinds.small, '小盲'], [s.bigBlindIndex, s.blinds.big, '大盲']]) {
      if (s.players[id].eliminated) continue;
      const paid = this._pay(s.players[id], amount);
      s.players[id].lastAction = `${label} ${paid}${s.players[id].allIn ? ' · 全押' : ''}`;
      this._log(`${s.players[id].name} ${s.players[id].lastAction}`, 'blind', id, paid);
    }
    s.currentPlayerIndex = headsUp ? s.dealerIndex : this._nextSeat(s.bigBlindIndex, player => !player.eliminated && !player.allIn);
    this._stabilize(s.bigBlindIndex, true);
    this._assertConservation();
    return this.getPublicState();
  }

  nextHand() { return this.startHand(); }

  legalActions() {
    const s = this._s, player = s.players[s.currentPlayerIndex];
    if (!LIVE_PHASES.has(s.phase) || !player || player.folded || player.allIn || player.eliminated) return { ...EMPTY_LEGAL };
    const owed = Math.max(0, s.currentBet - player.bet);
    const maximum = player.bet + player.stack;
    const minimum = s.currentBet === 0 ? s.blinds.big : s.currentBet + s.minRaise;
    const reopened = player.actedAt === null || s.currentBet - player.actedAt >= player.reopenSize;
    const hasBettingOpponent = this._actors().some(other => other.id !== player.id);
    const canRaise = reopened && hasBettingOpponent && maximum > s.currentBet;
    return {
      canFold: owed > 0, canCheck: owed === 0, canCall: owed > 0,
      canRaise, canAllIn: owed >= player.stack || canRaise,
      callAmount: Math.min(owed, player.stack), minRaiseTo: minimum, maxRaiseTo: maximum, allInTo: maximum,
      isShortAllInOnly: canRaise && maximum < minimum,
    };
  }

  act(type, amount) {
    const s = this._s, player = s.players[s.currentPlayerIndex];
    const legal = this.legalActions();
    if (!player || !LIVE_PHASES.has(s.phase)) throw new Error('当前没有等待中的行动。');
    if (typeof type === 'object') { amount = type.amount; type = type.type; }
    if (type === 'allin') type = 'all-in';
    if (type === 'bet') type = 'raise';
    const actorId = player.id;
    let loggedType = type, text, paid = 0, fullRaise = false;
    if (type === 'fold') {
      if (!legal.canFold) throw new Error('可以过牌时无需弃牌。');
      player.folded = true; text = '弃牌';
      if (player.isHuman) s.sessionStats.folds++;
    } else if (type === 'check') {
      if (!legal.canCheck) throw new Error('面前有下注，无法过牌。');
      text = '过牌';
    } else if (type === 'call') {
      if (!legal.canCall) throw new Error('没有需要跟注的筹码。');
      paid = this._pay(player, legal.callAmount);
      text = player.allIn ? `全押跟注 ${paid}` : `跟注 ${paid}`;
    } else if (type === 'raise' || type === 'all-in') {
      if (type === 'all-in' && !legal.canAllIn) throw new Error('本轮加注未重新开放，不能超额全押。');
      const target = type === 'all-in' ? legal.maxRaiseTo : amount;
      if (!Number.isSafeInteger(target) || target < 0) throw new Error('加注总额必须为正整数。');
      if (target > legal.maxRaiseTo) throw new Error('筹码不足。');
      if (target <= s.currentBet && type === 'all-in') {
        paid = this._pay(player, player.stack);
        text = `全押跟注 ${paid}`;
        loggedType = 'call';
      } else {
        if (!legal.canRaise) throw new Error('当前不可加注。');
        if (target <= s.currentBet) throw new Error('加注必须高于当前下注。');
        if (target < legal.minRaiseTo && target !== legal.maxRaiseTo) throw new Error(`最小加注至 ${legal.minRaiseTo}。`);
        const increase = target - s.currentBet;
        fullRaise = increase >= s.minRaise;
        const opening = s.currentBet === 0;
        if (fullRaise) s.minRaise = increase;
        paid = this._pay(player, target - player.bet);
        s.currentBet = target;
        text = player.allIn ? `全押至 ${target}` : `${opening ? '下注' : '加注至'} ${target}`;
        loggedType = player.allIn ? 'all-in' : 'raise';
        player.pfr ||= s.phase === 'preflop';
        if (player.isHuman) s.sessionStats.raises++;
      }
    } else throw new Error('未知行动。');
    if (paid > 0 && s.phase === 'preflop') player.vpip = true;
    player.actedAt = s.currentBet;
    player.reopenSize = s.minRaise;
    player.lastAction = text;
    this._log(`${player.name} ${text}`, loggedType, actorId, paid);
    this._stabilize(actorId);
    this._assertConservation();
    return { type: loggedType, amount: paid, playerId: actorId, fullRaise, state: this.getPublicState() };
  }

  _needsAction(player) {
    return !player.folded && !player.allIn && !player.eliminated && (player.actedAt === null || player.bet < this._s.currentBet);
  }

  _stabilize(previousActor, initializing = false) {
    const s = this._s;
    const alive = this._livePlayers();
    if (alive.length === 1) { this._finish(false); return; }
    const actors = this._actors();
    if (actors.length <= 1) {
      const last = actors[0];
      const otherBet = last ? Math.max(0, ...alive.filter(player => player.id !== last.id).map(player => player.bet)) : 0;
      if (!last || last.bet >= otherBet) { this._refundUncalled(); this._runout(); return; }
      // No dry-side-pot betting: the lone player can call the effective all-in
      // amount or fold. A short posted BB cannot force a meaningless overcall.
      s.currentBet = otherBet;
      s.currentPlayerIndex = last.id;
      return;
    }
    const pending = actors.filter(player => this._needsAction(player));
    if (!pending.length) { this._advanceStreet(); return; }
    if (initializing && pending.some(player => player.id === s.currentPlayerIndex)) return;
    s.currentPlayerIndex = this._nextSeat(previousActor, player => this._needsAction(player));
  }

  _refundUncalled() {
    const s = this._s;
    const contributors = [...s.players].sort((a, b) => b.contribution - a.contribution);
    const high = contributors[0], second = contributors[1]?.contribution || 0;
    if (high.contribution > second) {
      const returned = high.contribution - second;
      high.contribution -= returned; high.bet = Math.max(0, high.bet - returned); high.stack += returned;
      high.allIn = high.stack === 0;
      this._log(`${high.name} 收回无人跟注的 ${returned}`, 'return', high.id, returned);
    }
  }

  _dealStreet() {
    const s = this._s;
    s.burns.push(s.deck.pop());
    if (s.board.length === 0) { s.board.push(s.deck.pop(), s.deck.pop(), s.deck.pop()); s.phase = 'flop'; }
    else if (s.board.length === 3) { s.board.push(s.deck.pop()); s.phase = 'turn'; }
    else if (s.board.length === 4) { s.board.push(s.deck.pop()); s.phase = 'river'; }
    this._log(`${PHASE_NAMES[s.phase]} · ${s.board.map(cardLabel).join(' ')}`, 'street');
  }

  _advanceStreet() {
    const s = this._s;
    this._refundUncalled();
    if (s.phase === 'river') { this._finish(true); return; }
    for (const player of s.players) { player.bet = 0; player.actedAt = null; player.reopenSize = s.blinds.big; if (!player.folded && !player.allIn) player.lastAction = ''; }
    s.currentBet = 0; s.minRaise = s.blinds.big;
    this._dealStreet();
    s.currentPlayerIndex = this._nextSeat(s.dealerIndex, player => this._needsAction(player));
    if (this._actors().length <= 1) this._runout();
  }

  _runout() {
    const s = this._s;
    this._refundUncalled();
    while (s.board.length < 5) this._dealStreet();
    this._finish(true);
  }

  _potLayers() {
    const s = this._s;
    const levels = [...new Set(s.players.map(player => player.contribution).filter(Boolean))].sort((a, b) => a - b);
    let previous = 0;
    const pots = [];
    for (const level of levels) {
      const contributors = s.players.filter(player => player.contribution >= level);
      const pot = { amount: (level - previous) * contributors.length, eligibleIds: contributors.filter(player => !player.folded && !player.eliminated).map(player => player.id) };
      previous = level;
      const prior = pots.at(-1);
      // Folded dead money can create contribution levels without creating a
      // new contest. Only a changed eligibility set defines a separate pot.
      if (prior && prior.eligibleIds.join(',') === pot.eligibleIds.join(',')) prior.amount += pot.amount;
      else pots.push(pot);
    }
    return pots;
  }

  _finish(showdown) {
    const s = this._s;
    this._refundUncalled();
    const totalPot = this.pot;
    const alive = this._livePlayers();
    const evaluations = new Map();
    if (showdown) for (const player of alive) evaluations.set(player.id, evaluateHand([...player.hole, ...s.board]));
    const pots = alive.length === 1 ? [{ amount: totalPot, eligibleIds: [alive[0].id] }] : this._potLayers();
    const won = new Map();
    for (const pot of pots) {
      if (!pot.eligibleIds.length) throw new Error('底池没有合法归属。');
      let winnerIds = [];
      for (const id of pot.eligibleIds) {
        const comparison = !winnerIds.length ? 1 : compareHands(evaluations.get(id), evaluations.get(winnerIds[0]));
        if (comparison > 0) winnerIds = [id];
        else if (comparison === 0) winnerIds.push(id);
      }
      winnerIds.sort((a, b) => ((a - s.dealerIndex + 5) % 6) - ((b - s.dealerIndex + 5) % 6));
      pot.winnerIds = winnerIds;
      const share = Math.floor(pot.amount / winnerIds.length);
      const odd = pot.amount % winnerIds.length;
      winnerIds.forEach((id, index) => {
        const amount = share + (index < odd ? 1 : 0);
        s.players[id].stack += amount;
        won.set(id, (won.get(id) || 0) + amount);
      });
    }
    const human = s.players[0];
    const stats = s.sessionStats;
    stats.handsPlayed++;
    stats.vpipCount += Number(human.vpip); stats.preflopRaiseCount += Number(human.pfr);
    stats.netChips += human.stack - human.startingStack;
    if (showdown && !human.folded && human.hole.length) stats.showdowns++;
    if (won.has(0)) {
      stats.handsWon++; stats.currentWinStreak++; stats.bestWinStreak = Math.max(stats.bestWinStreak, stats.currentWinStreak);
      stats.biggestPot = Math.max(stats.biggestPot, won.get(0));
    } else stats.currentWinStreak = 0;
    if (evaluations.has(0) && (!stats.bestHand || compareHands(evaluations.get(0), stats.bestHand) > 0)) stats.bestHand = evaluations.get(0);
    const winners = [...won].map(([id, amount]) => ({ id, name: s.players[id].name, amount, handName: showdown ? evaluations.get(id).name : '其余玩家弃牌' }));
    const summary = winners.map(winner => `${winner.name} 赢得 ${winner.amount}${showdown ? ` · ${winner.handName}` : ''}`).join('；');
    this._log(summary, 'win');
    const playerResults = s.players.filter(player => player.hole.length).map(player => ({
      id: player.id, name: player.name, net: player.stack - player.startingStack, contribution: player.contribution,
      hole: player.isHuman || (showdown && !player.folded) ? [...player.hole] : [null, null],
      handName: evaluations.get(player.id)?.name || (player.folded ? '已弃牌' : '未摊牌'),
      bestCards: evaluations.get(player.id)?.cards || [], won: won.get(player.id) || 0, folded: player.folded,
    }));
    s.lastResult = { handNumber: s.handNumber, totalPot, winners, pots, summary, showdown, board: [...s.board], playerResults, actions: clone(s.handHistory) };
    for (const player of s.players) {
      player.winnings = won.get(player.id) || 0;
      player.bet = 0; player.contribution = 0; player.allIn = false;
    }
    if (s.mode === 'tournament') {
      const remaining = s.players.filter(player => player.stack > 0);
      const busted = s.players.filter(player => player.stack === 0 && !player.eliminated);
      for (const player of busted) {
        player.eliminated = true;
        player.rank = remaining.length + 1 + busted.filter(other => other.startingStack > player.startingStack).length;
        this._log(`${player.name} 本场第 ${player.rank} 名`, 'elimination', player.id);
      }
      if (remaining.length === 1) { s.winnerId = remaining[0].id; remaining[0].rank = 1; s.gameOver = true; }
      if (human.eliminated) { s.humanRank = human.rank; s.gameOver = true; }
      if (s.winnerId === 0) s.humanRank = 1;
    }
    s.phase = 'complete'; s.currentPlayerIndex = -1; s.currentBet = 0;
    this._assertConservation();
  }

  /** Decide solely from one player's cards plus publicly observable action.
   * Random hands approximate equity, not a GTO solver or hidden-card oracle. */
  botAction() {
    const s = this._s, player = s.players[s.currentPlayerIndex];
    if (!player || player.isHuman || !LIVE_PHASES.has(s.phase)) return null;
    const legal = this.legalActions();
    const personality = PERSONALITIES[player.id - 1];
    const opponents = this._livePlayers().length - 1;
    const iterations = { casual: 56, standard: 88, expert: 144 }[s.difficulty];
    const random = () => this._random(true);
    const rawEquity = estimateEquity(player.hole, s.board, opponents, iterations, random);
    const recentRaises = s.handHistory.filter(entry => ['raise', 'all-in'].includes(entry.type) && entry.phase === s.phase && entry.playerId !== player.id).length;
    const noise = (random() - .5) * ({ casual: .24, standard: .10, expert: .035 }[s.difficulty]);
    const rangeDiscount = s.difficulty === 'expert' ? Math.min(.13, recentRaises * .045) : Math.min(.08, recentRaises * .025);
    const equity = clamp(rawEquity + noise - rangeDiscount, .01, .995);
    const fairShare = 1 / (opponents + 1);
    const pot = this.pot;
    const potOdds = legal.callAmount / Math.max(1, pot + legal.callAmount);
    const stackRisk = legal.callAmount / Math.max(1, player.stack);
    const preflop = s.phase === 'preflop';
    const riskPremium = (s.mode === 'tournament' && stackRisk > .45 ? .045 : .01) + personality.tightness;
    const callValue = equity + personality.sticky - riskPremium;
    const comfortable = equity > fairShare + .07 + personality.tightness;
    const strong = equity > Math.max(.53, fairShare + .25);
    const veryStrong = equity > .79;
    const lastPosition = this._nextSeat(player.id, other => !other.folded && !other.allIn && !other.eliminated) === this._nextSeat(s.dealerIndex, other => !other.folded && !other.allIn && !other.eliminated);
    const bluffChance = personality.bluff * (opponents === 1 ? 1 : opponents === 2 ? .58 : .23) * (recentRaises ? .30 : 1) * (lastPosition ? 1.2 : .85);
    const bluff = random() < bluffChance && stackRisk < .15;
    let action;
    if (legal.canRaise && (veryStrong || (comfortable && random() < personality.aggression) || (bluff && !preflop))) {
      let target;
      if (preflop) {
        target = s.currentBet <= s.blinds.big ? Math.round(s.blinds.big * (2.2 + random() * 1.2)) : Math.round(s.currentBet * (2.1 + random() * .75));
      } else {
        const fraction = strong ? .65 + random() * .45 : .35 + random() * .4;
        target = s.currentBet + Math.round((pot + legal.callAmount) * fraction);
      }
      if ((veryStrong && player.stack < pot * 1.7) || (preflop && player.stack < s.blinds.big * 10 && comfortable)) target = legal.maxRaiseTo;
      target = Math.max(legal.minRaiseTo, target);
      // Marginal hands avoid accidentally committing an entire deep stack.
      if (target > legal.maxRaiseTo * .72 && !strong && !bluff && legal.canCall) action = { type: 'call' };
      else action = { type: target >= legal.maxRaiseTo ? 'all-in' : 'raise', amount: Math.min(target, legal.maxRaiseTo) };
    } else if (legal.canCheck) {
      action = { type: 'check' };
    } else if (callValue >= potOdds && (stackRisk < .38 || equity > .47 + riskPremium || legal.callAmount < s.blinds.big * 2)) {
      // Small preflop calls use both price and relative starting-hand strength.
      const weakPreflop = preflop && equity < fairShare - .015 + personality.tightness && legal.callAmount > s.blinds.big * 1.1;
      action = { type: weakPreflop ? 'fold' : 'call' };
    } else {
      action = { type: legal.canFold ? 'fold' : 'check' };
    }
    this.act(action.type, action.amount);
    return { ...action, playerId: player.id };
  }

  getPublicState() {
    const s = this._s;
    const reveal = s.phase === 'complete' && s.lastResult?.showdown;
    return {
      phase: s.phase, handNumber: s.handNumber, mode: s.mode, difficulty: s.difficulty,
      players: s.players.map(player => ({
        id: player.id, name: player.name, personality: player.personality, style: player.style, brand: player.isHuman ? null : PERSONALITIES[player.id-1].brand,
        stack: player.stack, startingStack: player.startingStack, bet: player.bet, contribution: player.contribution,
        folded: player.folded, allIn: player.allIn, eliminated: player.eliminated, rank: player.rank, isHuman: player.isHuman,
        isDealer: player.id === s.dealerIndex, isSmallBlind: player.id === s.smallBlindIndex, isBigBlind: player.id === s.bigBlindIndex,
        hole: player.hole.map(card => player.isHuman || (reveal && !player.folded) ? card : null),
        lastAction: player.lastAction, winnings: player.winnings,
      })),
      board: [...s.board], pot: this.pot, sidePots: LIVE_PHASES.has(s.phase) ? this._potLayers() : [],
      blinds: { ...s.blinds }, dealerIndex: s.dealerIndex, smallBlindIndex: s.smallBlindIndex, bigBlindIndex: s.bigBlindIndex,
      currentPlayerIndex: s.currentPlayerIndex, currentBet: s.currentBet, minRaise: s.minRaise,
      legalActions: this.legalActions(), history: clone(s.history), lastResult: clone(s.lastResult),
      gameOver: s.gameOver, winnerId: s.winnerId, humanRank: s.humanRank, totalChips: s.totalChips,
      sessionStats: clone(s.sessionStats), handsUntilBlindIncrease: s.mode === 'practice' ? null : 10 - ((s.handNumber - 1) % 10),
    };
  }

  serialize() { return JSON.stringify(this._s); }

  static restore(json) {
    let saved;
    try { saved = typeof json === 'string' ? JSON.parse(json) : clone(json); } catch { throw new Error('存档无法读取。'); }
    if (!saved || saved.schemaVersion !== 1 || !Array.isArray(saved.players) || saved.players.length !== 6 || !['ready', 'complete', ...LIVE_PHASES].includes(saved.phase) || !['tournament', 'practice'].includes(saved.mode) || !['casual', 'standard', 'expert'].includes(saved.difficulty)) throw new Error('存档格式或版本不兼容。');
    const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
    const seat = value => integer(value) && value < 6;
    const active = LIVE_PHASES.has(saved.phase);
    const fail = () => { throw new Error('存档状态不一致，请开始新比赛。'); };
    if (!integer(saved.handNumber) || !integer(saved.currentBet) || !integer(saved.minRaise, 1) || !integer(saved.rng, 1) || saved.rng > 4294967295 || !integer(saved.aiRng, 1) || saved.aiRng > 4294967295 || !integer(saved.historyId) || typeof saved.gameOver !== 'boolean' || !Array.isArray(saved.deck) || !Array.isArray(saved.burns) || !Array.isArray(saved.history) || !Array.isArray(saved.handHistory) || !saved.sessionStats || !saved.blinds) fail();
    if ((saved.phase === 'ready') !== (saved.handNumber === 0) || (active ? !seat(saved.currentPlayerIndex) : saved.currentPlayerIndex !== -1)) fail();
    const expectedLevel = saved.mode === 'practice' ? 0 : Math.min(Math.max(0, Math.floor((saved.handNumber - 1) / 10)), BLIND_LEVELS.length - 1);
    if (saved.blinds.level !== expectedLevel + 1 || saved.blinds.small !== BLIND_LEVELS[expectedLevel][0] || saved.blinds.big !== BLIND_LEVELS[expectedLevel][1] || saved.minRaise < saved.blinds.big) fail();
    if (saved.handNumber > 0 && (![saved.dealerIndex, saved.smallBlindIndex, saved.bigBlindIndex].every(seat) || saved.smallBlindIndex === saved.bigBlindIndex)) fail();
    if (saved.handNumber === 0 && (saved.dealerIndex !== -1 || saved.smallBlindIndex !== -1 || saved.bigBlindIndex !== -1)) fail();
    if (saved.gameOver && (saved.phase !== 'complete' || saved.mode !== 'tournament')) fail();
    if (saved.winnerId !== null && !seat(saved.winnerId)) fail();
    if (saved.humanRank !== null && (!integer(saved.humanRank, 1) || saved.humanRank > 6)) fail();
    for (const field of ['handsPlayed', 'handsWon', 'showdowns', 'biggestPot', 'currentWinStreak', 'bestWinStreak', 'raises', 'folds', 'vpipCount', 'preflopRaiseCount']) if (!integer(saved.sessionStats[field])) fail();
    if (!Number.isSafeInteger(saved.sessionStats.netChips) || saved.sessionStats.handsPlayed !== saved.handNumber - Number(active)) fail();
    for (const entry of [...saved.history, ...saved.handHistory]) if (!entry || typeof entry.text !== 'string' || typeof entry.type !== 'string' || !integer(entry.id, 1) || !integer(entry.handNumber, 1)) fail();
    const game = Object.create(PokerGame.prototype);
    game._s = saved;
    for (const [index, player] of saved.players.entries()) {
      if (player.id !== index || player.isHuman !== (index === 0) || !Number.isSafeInteger(player.stack) || player.stack < 0 || !Number.isSafeInteger(player.bet) || player.bet < 0 || !Number.isSafeInteger(player.contribution) || player.contribution < player.bet) throw new Error('存档筹码数据无效。');
      assertCards(player.hole, 0, 2);
      if (typeof player.name !== 'string' || typeof player.personality !== 'string' || typeof player.lastAction !== 'string' || typeof player.folded !== 'boolean' || typeof player.allIn !== 'boolean' || typeof player.eliminated !== 'boolean' || !integer(player.startingStack) || !integer(player.winnings) || !integer(player.reopenSize, 1) || (player.actedAt !== null && !integer(player.actedAt))) fail();
      if (player.eliminated && player.stack !== 0) fail();
      if (saved.handNumber > 0 && player.hole.length !== (player.startingStack > 0 ? 2 : 0)) fail();
      if (active && ((player.allIn && player.stack > 0) || (!player.eliminated && player.stack === 0 && !player.allIn) || player.bet > saved.currentBet || (!player.allIn && !player.folded && player.actedAt !== null && player.actedAt > saved.currentBet))) fail();
    }
    assertCards(saved.board, 0, 5);
    const streetBoardLength = { ready: 0, preflop: 0, flop: 3, turn: 4, river: 5 };
    if (saved.phase !== 'complete' && saved.board.length !== streetBoardLength[saved.phase]) fail();
    if (![0, 3, 4, 5].includes(saved.board.length) || saved.burns.length !== (saved.board.length === 0 ? 0 : saved.board.length - 2)) fail();
    if (saved.phase === 'complete' && (!saved.lastResult || saved.currentBet !== 0 || saved.players.some(player => player.contribution !== 0 || player.bet !== 0) || JSON.stringify(saved.lastResult.board) !== JSON.stringify(saved.board))) fail();
    if (saved.phase !== 'complete' && saved.lastResult !== null) fail();
    const allCards = [...saved.deck, ...saved.burns, ...saved.board, ...saved.players.flatMap(player => player.hole)];
    if (saved.handNumber > 0 && (allCards.length !== 52 || new Set(allCards).size !== 52 || allCards.some(card => !DECK.includes(card)))) throw new Error('存档牌堆数据无效。');
    if (saved.handNumber === 0 && allCards.length) fail();
    if (active && game._livePlayers().length < 2) fail();
    if (LIVE_PHASES.has(saved.phase) && !game._needsAction(saved.players[saved.currentPlayerIndex] || {})) throw new Error('存档行动位置无效。');
    game._assertConservation();
    // Identity-only migration: retain cards, chip amounts, turn order and RNG.
    const oldNames=['NOVA','MILO','VERA','KAI','RUBY'];
    const replacements=Object.fromEntries(oldNames.map((name,i)=>[name,PERSONALITIES[i].name]));
    const renameText=value=>typeof value==='string'?value.replace(/\b(?:NOVA|MILO|VERA|KAI|RUBY)\b/g,name=>name===saved.players[0].name?name:replacements[name]):value;
    for(const player of saved.players)if(!player.isHuman){player.name=PERSONALITIES[player.id-1].name;player.personality=PERSONALITIES[player.id-1].label;}
    for(const list of [saved.history,saved.handHistory,saved.lastResult?.actions])if(Array.isArray(list))for(const entry of list)if(entry.playerId!==0)entry.text=renameText(entry.text);
    if(saved.lastResult){
      saved.lastResult.summary=renameText(saved.lastResult.summary);
      for(const list of [saved.lastResult.winners,saved.lastResult.playerResults])if(Array.isArray(list))for(const entry of list)if(Number.isInteger(entry.id)&&entry.id>0&&entry.id<6)entry.name=PERSONALITIES[entry.id-1].name;
    }
    return game;
  }

  _assertConservation() {
    const s = this._s;
    if (!Number.isSafeInteger(s.totalChips) || s.totalChips <= 0 || s.players.some(player => !Number.isSafeInteger(player.stack) || player.stack < 0 || !Number.isSafeInteger(player.contribution) || player.contribution < 0)) throw new Error('筹码状态无效。');
    const total = s.players.reduce((sum, player) => sum + player.stack + player.contribution, 0);
    if (total !== s.totalChips) throw new Error(`筹码守恒检查失败：${total} / ${s.totalChips}`);
  }
}
