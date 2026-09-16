import test from 'node:test';
import assert from 'node:assert/strict';
import {PokerGame, PERSONALITIES, DECK} from '../web/engine.js';

const sampleSize = 40;

// Use real blind posting, dealer rotation and legal actions. Swapping cards
// keeps every fixture restorable, with all 52 cards still accounted for.
function swapCards(game, destination, cards) {
  const state = game._s;
  const groups = [state.deck, state.burns, state.board, ...state.players.map(player => player.hole)];
  cards.forEach((card, index) => {
    const source = groups.find(group => group.includes(card));
    const sourceIndex = source.indexOf(card);
    [destination[index], source[sourceIndex]] = [source[sourceIndex], destination[index]];
  });
}

function assertValidState(game) {
  const state = game._s;
  assert.deepEqual([...state.deck, ...state.burns, ...state.board, ...state.players.flatMap(player => player.hole)].sort(), [...DECK].sort());
  assert.equal(state.players.reduce((total, player) => total + player.stack + player.contribution, 0), state.totalChips);
  assert.doesNotThrow(() => PokerGame.restore(game.serialize()));
}

function fixture({actor, seed, hole, phase = 'preflop', board = [], bet = 40, difficulty = 'standard'}) {
  const game = new PokerGame({mode: 'practice', difficulty, seed: `boldness-${seed}`});
  game.startHand();
  // The target is immediately after the initial bettor, with all six seats
  // still live. This catches the old "everyone flees a minimum raise" case.
  const desiredDealer = (actor + (phase === 'preflop' ? 2 : 4)) % 6;
  while (game._s.dealerIndex !== desiredDealer) {
    while (game._s.phase !== 'complete') game.act(game.legalActions().canFold ? 'fold' : 'check');
    game.startHand();
  }
  for (let steps = 0; game._s.phase !== phase; steps++) {
    assert.ok(steps < 30, 'fixture reaches the requested street');
    game.act(game.legalActions().canCheck ? 'check' : 'call');
  }
  swapCards(game, game._s.players[actor].hole, hole);
  swapCards(game, game._s.board, board);
  game.act('raise', bet);
  assert.equal(game._s.currentPlayerIndex, actor);
  assert.equal(game._s.players.filter(player => !player.folded).length, 6);
  assertValidState(game);
  return game;
}

function decide(game) {
  const dealingRng = game._s.rng;
  const action = game.botAction();
  assert.equal(game._s.rng, dealingRng, 'policy changes cannot consume the card-dealing RNG');
  assertValidState(game);
  return action;
}

test('playable suited connectors defend small opening raises without calling large pressure blindly', () => {
  let cheapContinues = 0, expensiveFolds = 0;
  for (let actor = 1; actor <= 5; actor++) {
    let continues = 0;
    for (let seed = 0; seed < sampleSize; seed++) {
      const options = {actor, seed, hole: ['7s', '6s']};
      const cheap = decide(fixture({...options, bet: 40}));
      const expensive = decide(fixture({...options, bet: 1000}));
      continues += Number(cheap.type !== 'fold');
      expensiveFolds += Number(expensive.type === 'fold');
    }
    cheapContinues += continues;
    assert.ok(continues >= sampleSize * .25, `${PERSONALITIES[actor - 1].name} should sometimes defend a playable hand for 2 BB`);
  }
  assert.ok(cheapContinues >= sampleSize * 5 * .50, 'a minimum raise must not clear out almost every playable hand');
  assert.ok(expensiveFolds >= sampleSize * 5 * .90, 'cheap participation must not become automatic calls for half a stack');
});

test('a personal pair or strong flush draw often continues against a small flop bet', () => {
  for (const {hole, board, label} of [
    {hole: ['7s', '3c'], board: ['Qh', '8c', '3d'], label: 'own bottom pair'},
    {hole: ['6s', '5s'], board: ['As', '7s', '2h'], label: 'four-card flush draw'},
  ]) {
    let continues = 0;
    for (let actor = 1; actor <= 5; actor++) for (let seed = 0; seed < sampleSize; seed++) {
      const action = decide(fixture({actor, seed, hole, board, phase: 'flop', bet: 20}));
      continues += Number(action.type !== 'fold');
    }
    assert.ok(continues >= sampleSize * 5 * .65, `${label} should usually continue for 20 into 140`);
  }
});

test('river air still folds to a substantial bet rather than mistaking boldness for a forced all-in', () => {
  for (const difficulty of ['casual', 'standard', 'expert']) {
    let folds = 0;
    for (let actor = 1; actor <= 5; actor++) for (let seed = 0; seed < 12; seed++) {
      const action = decide(fixture({actor, seed, difficulty, hole: ['7c', '2d'], board: ['As', 'Kd', '9h', '5s', '3c'], phase: 'river', bet: 1000}));
      folds += Number(action.type === 'fold');
      assert.notEqual(action.type, 'all-in', 'unmade river air has no draw to justify a shove');
    }
    assert.ok(folds >= 58, `${difficulty}: a bluff budget must not authorize hopeless large calls`);
  }
});

test('premium hands still reraise for value instead of only joining the wider calling range', () => {
  let raises = 0;
  for (let actor = 1; actor <= 5; actor++) for (let seed = 0; seed < 24; seed++) {
    const action = decide(fixture({actor, seed, hole: ['As', 'Ad'], bet: 40}));
    raises += Number(action.type === 'raise' || action.type === 'all-in');
  }
  assert.ok(raises >= 100, 'pocket aces should usually make a legal value reraise');
});

test('small-price defenses depend only on public state and the acting player’s cards', () => {
  for (let actor = 1; actor <= 5; actor++) for (const difficulty of ['casual', 'standard', 'expert']) {
    const first = fixture({actor, seed: 7, difficulty, hole: ['7s', '6s'], bet: 40});
    const second = PokerGame.restore(first.serialize());
    const state = second._s;
    const hiddenGroups = [state.deck, state.burns, ...state.players.filter(player => player.id !== actor).map(player => player.hole)];
    const reordered = hiddenGroups.flat().reverse();
    let offset = 0;
    for (const group of hiddenGroups) for (let index = 0; index < group.length; index++) group[index] = reordered[offset++];
    assert.deepEqual(decide(first), decide(second), 'hidden cards and future draws cannot influence the defense');
    assert.equal(first._s.aiRng, second._s.aiRng);
  }
});
