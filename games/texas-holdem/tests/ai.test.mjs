import test from 'node:test';
import assert from 'node:assert/strict';
import {PokerGame, PERSONALITIES, DECK} from '../web/engine.js';

const phases = ['preflop', 'flop', 'turn', 'river'];
const difficulties = ['casual', 'standard', 'expert'];

function assertCompleteState(game) {
  const state = game._s;
  assert.equal(state.players.reduce((sum, player) => sum + player.stack + player.contribution, 0), state.totalChips);
  assert.ok(state.players.every(player => Number.isSafeInteger(player.stack) && player.stack >= 0));
  const cards = [...state.deck, ...state.burns, ...state.board, ...state.players.flatMap(player => player.hole)];
  assert.equal(cards.length, 52);
  assert.deepEqual([...cards].sort(), [...DECK].sort());
  // A fixture must also satisfy the production save validator, including burn
  // count, blind positions, the pending actor, and the 52-card partition.
  assert.doesNotThrow(() => PokerGame.restore(game.serialize()));
}

function newHand({seed = 'ai-fixture', difficulty = 'standard', stacks} = {}) {
  const game = new PokerGame({seed, difficulty});
  if (stacks) {
    game._s.players.forEach((player, id) => { player.stack = stacks[id]; });
    game._s.totalChips = stacks.reduce((sum, value) => sum + value, 0);
  }
  game.startHand();
  return game;
}

function advanceTo(game, phase, actor) {
  for (let steps = 0; steps < 100; steps++) {
    if (game._s.phase === phase && game._s.currentPlayerIndex === actor) {
      assertCompleteState(game);
      return game;
    }
    assert.notEqual(game._s.phase, 'complete', `cannot reach ${phase}, seat ${actor}`);
    const legal = game.legalActions();
    game.act(legal.canCheck ? 'check' : 'call');
  }
  assert.fail(`unreachable ${phase}, seat ${actor}`);
}

function decide(game, label = '') {
  const legal = game.legalActions(), actor = game._s.currentPlayerIndex, dealRng = game._s.rng;
  const action = game.botAction();
  assert.ok(action, label);
  assert.equal(action.playerId, actor, label);
  assert.equal(game._s.rng, dealRng, 'AI decisions must not consume the dealing RNG');
  if (legal.canCheck) assert.notEqual(action.type, 'fold', 'free checks never become folds');
  if (action.type === 'check') assert.ok(legal.canCheck, label);
  else if (action.type === 'fold') assert.ok(legal.canFold, label);
  else if (action.type === 'call') assert.ok(legal.canCall, label);
  else if (action.type === 'all-in') assert.ok(legal.canAllIn, label);
  else if (action.type === 'raise') {
    assert.ok(legal.canRaise, label);
    assert.ok(Number.isSafeInteger(action.amount), label);
    assert.ok(action.amount >= legal.minRaiseTo && action.amount <= legal.maxRaiseTo, label);
  } else assert.fail(`unknown AI action ${action.type}`);
  assertCompleteState(game);
  return action;
}

function permuteHiddenCards(game, actor) {
  const state = game._s;
  const groups = [...state.players.filter(player => player.id !== actor).map(player => player.hole), state.burns, state.deck];
  const hidden = groups.flat().reverse();
  let offset = 0;
  for (const group of groups) for (let i = 0; i < group.length; i++) group[i] = hidden[offset++];
  assertCompleteState(game);
}

// Swap a predetermined legal deal into the existing 52-card partition. Unlike
// replacing array literals, this cannot duplicate a card or omit a burned card.
function swapCard(game, destination, index, card) {
  const groups = [game._s.deck, game._s.burns, game._s.board, ...game._s.players.map(player => player.hole)];
  for (const group of groups) {
    const sourceIndex = group.indexOf(card);
    if (sourceIndex >= 0) {
      [destination[index], group[sourceIndex]] = [group[sourceIndex], destination[index]];
      return;
    }
  }
  assert.fail(`missing card ${card}`);
}

function dealRiverAir(game, actor) {
  assert.equal(game._s.phase, 'preflop');
  ['7c', '2d'].forEach((card, index) => swapCard(game, game._s.players[actor].hole, index, card));
  const positions = [2, 3, 4, 6, 8]; // The three street burns remain in place.
  ['As', 'Kd', '9h', '5s', '3c'].forEach((card, index) => swapCard(game, game._s.deck, game._s.deck.length - positions[index], card));
  assertCompleteState(game);
}

for (let actor = 1; actor <= 5; actor++) {
  const brand = PERSONALITIES[actor - 1].brand;
  for (const phase of phases) {
    test(`${brand}: ${phase} decisions ignore opponents' holes, deck order and burned cards`, () => {
      for (const difficulty of difficulties) {
        const first = advanceTo(newHand({seed: `privacy-${actor}-${phase}`, difficulty}), phase, actor);
        const second = PokerGame.restore(first.serialize());
        const ownHole = [...second._s.players[actor].hole], board = [...second._s.board];
        permuteHiddenCards(second, actor);
        assert.deepEqual(second._s.players[actor].hole, ownHole);
        assert.deepEqual(second._s.board, board);
        assert.deepEqual(first.getPublicState().players.map(player => ({id: player.id, stack: player.stack, bet: player.bet, folded: player.folded})), second.getPublicState().players.map(player => ({id: player.id, stack: player.stack, bet: player.bet, folded: player.folded})));
        assert.deepEqual(decide(first, difficulty), decide(second, difficulty));
        assert.equal(first._s.aiRng, second._s.aiRng, 'private cards cannot change the policy random stream');
      }
    });
  }
}

test('AI chooses legal actions and preserves free checks through varied complete hands', () => {
  let decisions = 0, freeChecks = 0;
  for (const difficulty of difficulties) for (let seed = 1; seed <= 8; seed++) {
    const game = newHand({seed: `legality-${difficulty}-${seed}`, difficulty, stacks: seed % 2 ? undefined : [2000, 110, 450, 1500, 3000, 4940]});
    let step = 0;
    while (game._s.phase !== 'complete') {
      assert.ok(++step < 250, 'a hand must finish without a betting loop');
      const legal = game.legalActions();
      if (game._s.currentPlayerIndex !== 0) {
        freeChecks += Number(legal.canCheck);
        decide(game, `${difficulty}/${seed}/${step}`);
        decisions++;
      } else if (legal.canRaise && (step + seed) % 4 === 0) {
        const amount = Math.min(legal.maxRaiseTo, legal.minRaiseTo + game._s.blinds.big);
        game.act(amount === legal.maxRaiseTo ? 'all-in' : 'raise', amount);
      } else game.act(legal.canCheck ? 'check' : 'call');
      assertCompleteState(game);
    }
  }
  assert.ok(decisions > 100, 'exercise a mixture of bot decisions');
  assert.ok(freeChecks > 10, 'exercise the no-fold-when-checking rule');
});

test('short all-ins do not grant an AI a new raise after its earlier bet or check', () => {
  for (let actor = 1; actor <= 5; actor++) for (const priorBet of [0, 100]) {
    const short = (actor + 1) % 6, stacks = Array(6).fill(2000);
    stacks[short] = 20 + (priorBet ? 150 : 10);
    const game = advanceTo(newHand({seed: `short-${actor}-${priorBet}`, stacks}), 'flop', actor);
    game.act(priorBet ? 'raise' : 'check', priorBet || undefined);
    assert.equal(game._s.currentPlayerIndex, short);
    game.act('all-in');
    advanceTo(game, 'flop', actor);
    const legal = game.legalActions();
    assert.equal(legal.canRaise, false);
    assert.equal(legal.canAllIn, false);
    const action = decide(game);
    assert.ok(['call', 'fold'].includes(action.type));
  }
});

test('deep-stack river air facing repeated raises is not forced into a short all-in raise', () => {
  for (let actor = 1; actor <= 5; actor++) for (const difficulty of difficulties) for (let seed = 1; seed <= 8; seed++) {
    const game = newHand({seed: `pressure-${actor}-${seed}`, difficulty, stacks: Array(6).fill(10000)});
    dealRiverAir(game, actor);
    advanceTo(game, 'river', actor);
    assert.deepEqual(game._s.board, ['As', 'Kd', '9h', '5s', '3c']);
    game.act('check');
    game.act('raise', 2000);
    game.act('raise', 7000);
    advanceTo(game, 'river', actor);
    const legal = game.legalActions();
    assert.equal(legal.canRaise, true);
    assert.equal(legal.isShortAllInOnly, true);
    assert.ok(legal.minRaiseTo > legal.maxRaiseTo);
    assert.ok(game._s.players[actor].stack > 100 * game._s.blinds.big, 'the player still has a deep stack');
    const action = decide(game, `${actor}/${difficulty}/${seed}`);
    assert.ok(['call', 'fold'].includes(action.type), 'a legal short all-in raise is not an obligation for an unmade river hand');
  }
});
