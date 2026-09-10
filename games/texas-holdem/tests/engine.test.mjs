import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerGame, DECK, evaluateHand, compareHands, estimateEquity } from '../web/engine.js';

const cards = text => text.split(' ');
function rng(seed = 8234) {
  return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
}
function conserved(game) {
  const state = game.getPublicState();
  assert.equal(state.players.reduce((sum, player) => sum + player.stack, 0) + state.pot, state.totalChips);
  for (const player of state.players) { assert.ok(Number.isSafeInteger(player.stack)); assert.ok(player.stack >= 0); }
}
function finishPassive(game) {
  let actions = 0;
  while (game.getPublicState().phase !== 'complete') {
    const legal = game.legalActions();
    game.act(legal.canCheck ? 'check' : 'call');
    assert.ok(++actions < 120, 'hand must terminate');
  }
}
function finishFolds(game) {
  while (game.getPublicState().phase !== 'complete') {
    const legal = game.legalActions();
    game.act(legal.canFold ? 'fold' : 'check');
  }
}
function fixture({ players, board = '2c 3d 7h 8s 9h', currentBet = 0, minRaise = 20, current = 0, dealer = 5, phase = 'river' }) {
  const game = new PokerGame({ seed: 'fixture' });
  const s = game._s;
  s.phase = phase; s.handNumber = 1; s.dealerIndex = dealer; s.currentPlayerIndex = current;
  s.currentBet = currentBet; s.minRaise = minRaise; s.board = board ? cards(board) : [];
  for (const player of s.players) Object.assign(player, { stack: 0, startingStack: 0, contribution: 0, bet: 0, hole: [], eliminated: true, folded: true, allIn: false });
  players.forEach((value, index) => {
    const id = value.id ?? index, player = s.players[id];
    const contribution = value.contribution ?? value.bet ?? 0;
    Object.assign(player, { stack: 1000, contribution, bet: contribution, eliminated: false, folded: false, actedAt: null, reopenSize: minRaise, ...value });
    player.hole = cards(value.hole);
    player.startingStack = value.startingStack ?? player.stack + contribution;
    player.allIn = player.stack === 0;
  });
  s.totalChips = s.players.reduce((sum, player) => sum + player.stack + player.contribution, 0);
  const dealt = new Set([...s.board, ...s.players.flatMap(player => player.hole)]);
  s.deck = DECK.filter(card => !dealt.has(card)); s.burns = [];
  assert.equal(dealt.size, s.board.length + s.players.reduce((sum, player) => sum + player.hole.length, 0));
  conserved(game);
  return game;
}

test('all categories, ace-low straight, royal flush, double trips, three pairs', () => {
  const examples = [
    ['As Kd 9h 7c 4s 3h 2d', [0, 14, 13, 9, 7, 4]],
    ['As Ad Kh 9c 7s 4h 2d', [1, 14, 13, 9, 7]],
    ['As Ad Kh Kc 7s 7h 2d', [2, 14, 13, 7]],
    ['As Ad Ah Kc 7s 4h 2d', [3, 14, 13, 7]],
    ['As 2d 3h 4c 5s Kh Qd', [4, 5]],
    ['As Js 9s 7s 3s Kh Qd', [5, 14, 11, 9, 7, 3]],
    ['As Ad Ah Kc Ks Kh Qd', [6, 14, 13]],
    ['As Ad Ah Ac Ks Kh Qd', [7, 14, 13]],
    ['As 2s 3s 4s 5s Kh Qd', [8, 5]],
    ['As Ks Qs Js Ts 2c 3d', [8, 14]],
  ];
  for (const [input, expected] of examples) {
    const hand = evaluateHand(cards(input));
    assert.deepEqual(hand.rank, expected, input);
    assert.equal(hand.cards.length, 5); assert.equal(new Set(hand.cards).size, 5);
  }
  assert.equal(evaluateHand(cards('As Ks Qs Js Ts 2c 3d')).name, '皇家同花顺');
  assert.equal(compareHands(evaluateHand(cards('As Ad Kh 9c 7s')), evaluateHand(cards('Ac Ah Qs Jd Td'))), 1);
  assert.equal(compareHands(evaluateHand(cards('As Ks Qs Js Ts')), evaluateHand(cards('Ah Kh Qh Jh Th'))), 0);
  assert.throws(() => evaluateHand(cards('As As Qs Js Ts')));
  assert.throws(() => evaluateHand(cards('As Ks Qs Js')));
});

test('best of seven matches every five-card subset on 2,000 seeded deals', () => {
  const random = rng(9143);
  for (let sample = 0; sample < 2000; sample++) {
    const deck = [...DECK];
    for (let i = 0; i < 7; i++) { const j = i + Math.floor(random() * (52 - i)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const seven = deck.slice(0, 7); let best;
    for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) {
      const candidate = evaluateHand(seven.filter((_, k) => k !== i && k !== j));
      if (!best || compareHands(candidate, best) > 0) best = candidate;
    }
    assert.deepEqual(evaluateHand(seven).rank, best.rank, seven.join(' '));
  }
});

test('equity counts shared boards and does not treat ties as full wins', () => {
  assert.ok(Math.abs(estimateEquity(cards('2c 3d'), cards('As Ks Qs Js Ts'), 5, 20, rng()) - 1 / 6) < 1e-12);
  assert.equal(estimateEquity(cards('As Ks'), cards('Qs Js Ts 2d 3h'), 5, 20, rng()), 1);
  assert.equal(estimateEquity(cards('As Ks'), [], 0, 20, rng()), 1);
  const aa = estimateEquity(cards('As Ah'), [], 1, 2000, rng(77));
  assert.ok(aa > .80 && aa < .9, `AA random heads-up equity: ${aa}`);
  assert.throws(() => estimateEquity(cards('As Ah'), cards('As')));
});

test('six-handed blinds, exact preflop and postflop order, button progression', () => {
  const game = new PokerGame({ seed: 4 });
  let state = game.startHand();
  assert.deepEqual([state.dealerIndex, state.smallBlindIndex, state.bigBlindIndex], [0, 1, 2]);
  assert.equal(state.pot, 30);
  for (const id of [3, 4, 5, 0, 1, 2]) {
    assert.equal(game.getPublicState().currentPlayerIndex, id);
    game.act(game.legalActions().canCheck ? 'check' : 'call');
  }
  assert.equal(game.getPublicState().phase, 'flop');
  assert.equal(game.getPublicState().pot, 120);
  for (const id of [1, 2, 3, 4, 5, 0]) { assert.equal(game.getPublicState().currentPlayerIndex, id); game.act('check'); }
  assert.equal(game.getPublicState().phase, 'turn');
  finishPassive(game);
  state = game.nextHand();
  assert.deepEqual([state.dealerIndex, state.smallBlindIndex, state.bigBlindIndex], [1, 2, 3]);
});

test('heads-up button is SB and acts first preflop, last postflop', () => {
  const game = new PokerGame({ seed: 2 });
  game._s.players.forEach(player => { player.stack = [0, 2].includes(player.id) ? 6000 : 0; });
  let state = game.startHand();
  assert.deepEqual([state.dealerIndex, state.smallBlindIndex, state.bigBlindIndex, state.currentPlayerIndex], [0, 0, 2, 0]);
  game.act('call'); assert.equal(game.getPublicState().currentPlayerIndex, 2);
  game.act('check'); assert.equal(game.getPublicState().currentPlayerIndex, 2);
  finishPassive(game);
  state = game.nextHand();
  assert.deepEqual([state.dealerIndex, state.smallBlindIndex, state.bigBlindIndex, state.currentPlayerIndex], [2, 2, 0, 2]);
});

test('dead button and dead small blind preserve each surviving player big-blind turn', () => {
  for (const eliminatedId of [1, 2]) {
    const game = new PokerGame({ seed: 11 }); game.startHand(); finishFolds(game);
    game._s.players[0].stack += game._s.players[eliminatedId].stack;
    game._s.players[eliminatedId].stack = 0;
    const next = game.nextHand();
    assert.deepEqual([next.dealerIndex, next.smallBlindIndex, next.bigBlindIndex], [1, 2, 3]);
    assert.equal(next.players[eliminatedId].bet, 0);
    assert.equal(next.pot, eliminatedId === 2 ? 20 : 30);
    finishFolds(game);
    const after = game.nextHand();
    assert.deepEqual([after.dealerIndex, after.smallBlindIndex, after.bigBlindIndex], [2, 3, 4]);
    conserved(game);
  }
});

test('three-to-two transition never makes surviving prior BB post BB twice', () => {
  const game = new PokerGame({ seed: 42 });
  game._s.players.forEach(player => { player.stack = player.id < 3 ? 4000 : 0; });
  game.startHand(); finishFolds(game);
  game._s.players[1].stack += game._s.players[0].stack;
  game._s.players[0].stack = 0;
  const next = game.nextHand();
  assert.deepEqual([next.dealerIndex, next.smallBlindIndex, next.bigBlindIndex], [2, 2, 1]);
});

test('minimum raises are raise-to totals and invalid actions are atomic', () => {
  const game = new PokerGame({ seed: 5 }); game.startHand();
  assert.equal(game.legalActions().minRaiseTo, 40);
  const before = game.serialize();
  assert.throws(() => game.act('raise', 39)); assert.equal(game.serialize(), before);
  assert.throws(() => game.act('check')); assert.equal(game.serialize(), before);
  assert.throws(() => game.act('raise', 5000)); assert.equal(game.serialize(), before);
  assert.throws(() => game.act('raise', 90.5)); assert.equal(game.serialize(), before);
  game.act('raise', 75);
  assert.equal(game.legalActions().minRaiseTo, 130);
  assert.equal(game.legalActions().callAmount, 75);
  game.act('raise', 130);
  assert.equal(game.legalActions().minRaiseTo, 185);
});

test('single short all-in does not reopen prior actor; unacted player can still raise', () => {
  const game = fixture({ phase: 'flop', board: '2c 3d 7h', currentBet: 100, minRaise: 100, current: 1, players: [
    { hole: 'As Ad', bet: 100, actedAt: 100, reopenSize: 100 },
    { hole: 'Ks Kd', stack: 150, bet: 0 },
    { hole: 'Qs Qd', stack: 1000, bet: 0 },
  ] });
  game.act('all-in');
  assert.equal(game.getPublicState().currentPlayerIndex, 2);
  assert.equal(game.legalActions().canRaise, true); assert.equal(game.legalActions().minRaiseTo, 250);
  game.act('call');
  assert.equal(game.getPublicState().currentPlayerIndex, 0);
  assert.equal(game.legalActions().canRaise, false); assert.equal(game.legalActions().canAllIn, false);
  assert.equal(game.legalActions().callAmount, 50);
  assert.throws(() => game.act('raise', 250)); assert.throws(() => game.act('all-in'));
  game.act('call'); assert.equal(game.getPublicState().phase, 'turn'); conserved(game);
});

test('multiple short all-ins reopen individually only when cumulative full increment is faced', () => {
  const game = fixture({ phase: 'flop', board: '2c 3d 7h', currentBet: 100, minRaise: 100, current: 1, players: [
    { hole: 'As Ad', bet: 100, actedAt: 100, reopenSize: 100 },
    { hole: 'Ks Kd', stack: 125, bet: 0 },
    { hole: 'Qs Qd', stack: 1000, bet: 0 },
    { hole: 'Js Jd', stack: 200, bet: 0 },
    { hole: 'Ts Td', stack: 1000, bet: 0 },
  ] });
  game.act('all-in'); game.act('call'); game.act('all-in'); game.act('call');
  assert.equal(game.getPublicState().currentPlayerIndex, 0);
  assert.equal(game.legalActions().canRaise, true); assert.equal(game.legalActions().minRaiseTo, 300);
  game.act('call');
  assert.equal(game.getPublicState().currentPlayerIndex, 2);
  assert.equal(game.legalActions().callAmount, 75); assert.equal(game.legalActions().canRaise, false);
  game.act('call'); assert.equal(game.getPublicState().phase, 'turn');
});

test('short postflop opener does not reopen a prior check and still needs full next raise', () => {
  const game = fixture({ phase: 'flop', board: '2c 3d 7h', currentBet: 0, minRaise: 20, current: 1, players: [
    { hole: 'As Ad', bet: 0, actedAt: 0, reopenSize: 20 },
    { hole: 'Ks Kd', stack: 10, bet: 0 },
    { hole: 'Qs Qd', stack: 1000, bet: 0 },
  ] });
  game.act('all-in'); assert.equal(game.legalActions().minRaiseTo, 30);
  game.act('call'); assert.equal(game.legalActions().canRaise, false);
});

test('side pots, folded dead money, uncalled returns, and total chip conservation', () => {
  const game = fixture({ players: [
    { hole: 'As Ad', stack: 0, contribution: 100 },
    { hole: 'Ks Kd', stack: 0, contribution: 200 },
    { hole: 'Qs Qd', stack: 0, contribution: 350 },
  ] });
  game._finish(true);
  const state = game.getPublicState();
  assert.deepEqual(state.players.slice(0, 3).map(player => player.stack), [300, 200, 150]);
  assert.deepEqual(state.lastResult.pots.map(pot => pot.amount), [300, 200]);
  assert.equal(state.lastResult.totalPot, 500);
  assert.ok(state.history.some(entry => entry.type === 'return' && entry.amount === 150));
  conserved(game);
  const dead = fixture({ players: [
    { hole: 'As Ad', stack: 0, contribution: 50 },
    { hole: 'Ks Kd', stack: 0, contribution: 100 },
    { hole: 'Qs Qd', stack: 0, contribution: 100 },
    { hole: 'Js Jd', stack: 500, contribution: 100, folded: true },
  ] });
  dead._finish(true);
  assert.deepEqual(dead.getPublicState().players.slice(0, 4).map(player => player.stack), [200, 150, 0, 500]);
  assert.deepEqual(dead.getPublicState().players[3].hole, [null, null]);
  conserved(dead);
});

test('split pots put the odd chip left of button; each side pot splits separately', () => {
  const game = fixture({ board: 'As Ks Qs Js Ts', dealer: 0, players: [
    { hole: '2c 3c', stack: 500, contribution: 5 },
    { hole: '4c 5c', stack: 500, contribution: 5 },
    { hole: '6c 7c', stack: 500, contribution: 5, folded: true },
  ] });
  game._finish(true);
  assert.deepEqual(game.getPublicState().players.slice(0, 3).map(player => player.stack), [507, 508, 500]);
  assert.deepEqual(game.getPublicState().lastResult.pots[0].winnerIds, [1, 0]);
  conserved(game);
  const side = fixture({ board: 'As Ks Qs Js Ts', dealer: 0, players: [
    { hole: '2c 3c', stack: 500, contribution: 5 },
    { hole: '4c 5c', stack: 500, contribution: 10 },
    { hole: '6c 7c', stack: 500, contribution: 10 },
    { hole: '8c 9c', stack: 500, contribution: 10, folded: true },
  ] });
  side._finish(true);
  assert.deepEqual(side.getPublicState().lastResult.pots.map(pot => pot.amount), [20, 15]);
  assert.deepEqual(side.getPublicState().players.slice(0, 4).map(player => player.stack), [506, 515, 514, 500]);
  conserved(side);
});

test('folded blind dead money remains in one main pot when eligibility is unchanged', () => {
  const game = fixture({ players: [
    { hole: 'As Ad', stack: 900, contribution: 100 },
    { hole: 'Ks Kd', stack: 990, contribution: 10, folded: true },
    { hole: 'Qs Qd', stack: 900, contribution: 100 },
  ] });
  game._finish(true);
  assert.deepEqual(game.getPublicState().lastResult.pots, [{ amount: 210, eligibleIds: [0, 2], winnerIds: [0] }]);
  conserved(game);
});

test('all-in runout deals board once, settles immediately, no dry-side betting', () => {
  const game = fixture({ phase: 'preflop', board: '', currentBet: 100, minRaise: 100, current: 0, players: [
    { hole: 'As Ad', stack: 1000, bet: 0 },
    { hole: 'Ks Kd', stack: 0, bet: 100 },
  ] });
  assert.equal(game.legalActions().canRaise, false);
  assert.equal(game.legalActions().callAmount, 100);
  game.act('call');
  assert.equal(game.getPublicState().phase, 'complete'); assert.equal(game.getPublicState().board.length, 5);
  assert.equal(game._s.burns.length, 3); assert.equal(game.getPublicState().lastResult.showdown, true);
  assert.ok(game.getPublicState().players[1].hole.every(Boolean)); conserved(game);
});

test('short all-in big blind in heads-up refunds excess SB and auto-runs out', () => {
  const game = new PokerGame({ seed: 839 });
  game._s.players.forEach(player => { player.stack = player.id === 0 ? 11995 : player.id === 1 ? 5 : 0; });
  const state = game.startHand();
  assert.equal(state.phase, 'complete'); assert.equal(state.lastResult.totalPot, 10);
  assert.ok(state.history.some(entry => entry.type === 'return' && entry.amount === 5)); conserved(game);
});

test('public state hides bot holes, deck, RNG and mutation cannot affect game', () => {
  const game = new PokerGame({ seed: 33 }); game.startHand();
  const state = game.getPublicState();
  assert.ok(state.players[0].hole.every(Boolean));
  assert.ok(state.players.slice(1).every(player => player.hole.every(card => card === null)));
  assert.equal(state.deck, undefined); assert.equal(state.rng, undefined); assert.equal(state.aiRng, undefined);
  state.players[0].stack = 999999; state.history[0].text = 'changed';
  assert.notEqual(game.getPublicState().players[0].stack, 999999);
  assert.notEqual(game.getPublicState().history[0].text, 'changed');
});

test('bot decisions are invariant to hidden opponents cards and undealt deck order', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const first = new PokerGame({ seed, difficulty: 'expert' }); first.startHand();
    const second = PokerGame.restore(first.serialize());
    const actor = second._s.currentPlayerIndex;
    for (const player of second._s.players) if (player.id !== actor) {
      [player.hole[0], second._s.deck[0]] = [second._s.deck[0], player.hole[0]];
      second._s.deck.reverse();
    }
    assert.deepEqual(first.botAction(), second.botAction());
  }
});

test('save/restore resumes deterministic cards, actions, statistics and rejects invalid saves', () => {
  const original = new PokerGame({ seed: 'save' }); original.startHand(); original.botAction();
  const restored = PokerGame.restore(original.serialize());
  assert.equal(restored.serialize(), original.serialize());
  for (let count = 0; count < 100 && original.getPublicState().phase !== 'complete'; count++) {
    if (original.getPublicState().currentPlayerIndex === 0) {
      const action = original.legalActions().canCheck ? 'check' : 'call'; original.act(action); restored.act(action);
    } else assert.deepEqual(original.botAction(), restored.botAction());
    assert.equal(restored.serialize(), original.serialize());
  }
  assert.equal(original.getPublicState().phase, 'complete');
  assert.throws(() => PokerGame.restore('{')); assert.throws(() => PokerGame.restore('{}'));
  const bad = JSON.parse(original.serialize()); bad.players[0].stack++;
  assert.throws(() => PokerGame.restore(bad));
  const duplicate = JSON.parse(original.serialize()); duplicate.deck[0] = duplicate.deck[1];
  assert.throws(() => PokerGame.restore(duplicate));
});

test('restore rejects malformed phase, board, blind, actor and betting states before play', () => {
  const game = new PokerGame({ seed: 'restore-invalid' }); game.startHand();
  const corruptions = [
    save => { save.phase = 'river'; },
    save => { save.currentBet = -20; },
    save => { save.minRaise = 0; },
    save => { save.currentPlayerIndex = 99; },
    save => { save.blinds.big = '20'; },
    save => { save.aiRng = null; },
    save => { save.players[0].hole.pop(); },
    save => { save.players[0].contribution = -5; },
    save => { save.deck = {}; },
    save => { save.history = 'bad'; },
    save => { save.sessionStats = null; },
    save => { save.gameOver = true; },
  ];
  for (const corrupt of corruptions) {
    const save = JSON.parse(game.serialize()); corrupt(save);
    assert.throws(() => PokerGame.restore(save));
  }
  assert.equal(PokerGame.restore(new PokerGame({ seed: 3 }).serialize()).getPublicState().phase, 'ready');
});

test('practice resets stacks and keeps cumulative results, tournament levels each ten hands', () => {
  const game = new PokerGame({ mode: 'practice', seed: 3 });
  for (let hand = 1; hand <= 12; hand++) {
    const state = game.startHand();
    assert.equal(state.blinds.big, 20); assert.ok(state.players.every(player => player.startingStack === 2000));
    finishFolds(game);
  }
  assert.equal(game.getPublicState().sessionStats.handsPlayed, 12);
  assert.equal(game.getPublicState().gameOver, false);
  assert.notEqual(game.getPublicState().sessionStats.netChips, undefined);
  const tournament = new PokerGame({ seed: 3 });
  for (let hand = 1; hand <= 11; hand++) {
    const state = tournament.startHand();
    assert.equal(state.blinds.big, hand <= 10 ? 20 : 30); finishFolds(tournament);
  }
});

test('300 practice hands plus 60 tournaments complete legally with conserved integer chips', () => {
  const random = rng(55555);
  let completed = 0, steps = 0, longestHand = 0;
  const play = game => {
    let actions = 0;
    while (game.getPublicState().phase !== 'complete') {
      const state = game.getPublicState();
      if (state.currentPlayerIndex !== 0) game.botAction();
      else {
        const legal = game.legalActions(), choice = random();
        if (legal.canRaise && choice < .13) {
          const target = Math.min(legal.maxRaiseTo, legal.minRaiseTo + Math.floor(random() * Math.max(1, state.pot)));
          game.act(target === legal.maxRaiseTo ? 'all-in' : 'raise', target);
        } else if (legal.canCheck) game.act('check');
        else if (legal.canFold && choice < .38) game.act('fold');
        else game.act('call');
      }
      conserved(game); assert.ok(++actions < 200, 'no betting-loop deadlock'); steps++;
      if (steps % 17 === 0) assert.equal(PokerGame.restore(game.serialize()).serialize(), game.serialize(), 'valid in-flight and completed saves must restore');
    }
    assert.equal(game.getPublicState().pot, 0); completed++; longestHand = Math.max(longestHand, actions);
  };
  const practice = new PokerGame({ mode: 'practice', difficulty: 'casual', seed: 77 });
  for (let hand = 0; hand < 300; hand++) { practice.startHand(); play(practice); }
  for (let seed = 0; seed < 60; seed++) {
    const tournament = new PokerGame({ seed: `tourney-${seed}`, difficulty: ['casual', 'standard', 'expert'][seed % 3] });
    let hands = 0;
    while (!tournament.getPublicState().gameOver) { tournament.startHand(); play(tournament); assert.ok(++hands < 400, 'tournament must terminate'); }
    const state = tournament.getPublicState();
    assert.ok(state.humanRank >= 1 && state.humanRank <= 6);
    assert.throws(() => tournament.nextHand());
  }
  console.log(JSON.stringify({ completedHands: completed, legalActions: steps, longestHand }));
});
