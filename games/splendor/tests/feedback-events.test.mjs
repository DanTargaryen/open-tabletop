import test from 'node:test';
import assert from 'node:assert/strict';
import {acquisitionEvents} from '../web/feedback-events.js';
import {createGame, applyAction, projectGame, CARDS} from '../web/engine.js';

const clone = value => structuredClone(value);
const ordinary = CARDS.find(card => card.speciesId === 'BULBASAUR');
const evolved = CARDS.find(card => card.speciesId === 'IVYSAUR');
const special = CARDS.find(card => card.kind === 'legendary');
function snapshot() {
  return {schema: 1, version: 8, turn: 4, first: 0, phase: 'action', players: [0, 1].map(seat =>
    ({seat, name: `Player ${seat}`, cards: [], evolved: [], reserved: [], points: 0}))};
}
function add(before, card = ordinary, seat = 0) {
  const after = clone(before);
  after.version++;
  after.players[seat].cards.push(clone(card));
  return after;
}

test('ordinary capture emits public card, permanent bonus and points', () => {
  const before = snapshot(), after = add(before);
  const events = acquisitionEvents(before, after);
  assert.deepEqual(events, [{seat: 0, card: ordinary, kind: 'capture', fromCard: null,
    key: `9:0:${ordinary.id}:capture`, bonusChanges: {[ordinary.bonus]: 1}, pointsDelta: ordinary.points}]);
  events[0].card.nameZh = 'presentation mutation';
  assert.equal(after.players[0].cards[0].nameZh, ordinary.nameZh);
  assert.equal(before.players[0].cards.length, 0);
});

test('an actual free capture still emits an acquisition with no token spending', () => {
  const game = createGame(['You', 'Opponent']);
  const card = game.market[0][0];
  for (const [color, amount] of Object.entries(card.cost)) game.players[0].bonuses[color] = amount;
  const before = projectGame(game, 0);
  const after = projectGame(applyAction(game, 0, {type: 'buy', cardId: card.id}), 0);
  assert.deepEqual(after.players[0].tokens, before.players[0].tokens);
  assert.equal(acquisitionEvents(before, after)[0].card.id, card.id);
});

test('special capture reports its double bonus', () => {
  const before = snapshot(), [event] = acquisitionEvents(before, add(before, special, 1));
  assert.equal(event.seat, 1);
  assert.equal(event.kind, 'capture');
  assert.deepEqual(event.bonusChanges, {[special.bonus]: 2});
  assert.equal(event.pointsDelta, special.points);
});

test('real blind reservation emits nothing for either viewer', () => {
  const before = createGame(['You', 'Opponent']);
  const after = applyAction(before, 0, {type: 'reserve', tier: 1});
  for (const viewer of [0, 1]) assert.deepEqual(acquisitionEvents(projectGame(before, viewer), projectGame(after, viewer)), []);
});

test('evolution replaces old points and bonuses, using only the old public card', () => {
  const before = snapshot();
  before.players[1].cards.push(clone(ordinary));
  before.players[1].evolved = [{hidden: true}];
  const after = clone(before);
  after.version++;
  after.players[1].cards = [clone(evolved)];
  after.players[1].evolved.push({hidden: true});
  const [event] = acquisitionEvents(before, after);
  assert.equal(event.kind, 'evolve');
  assert.deepEqual(event.fromCard, ordinary);
  assert.equal(event.pointsDelta, evolved.points - ordinary.points);
  const expected = {};
  expected[ordinary.bonus] = -ordinary.bonusAmount;
  expected[evolved.bonus] = (expected[evolved.bonus] || 0) + evolved.bonusAmount;
  assert.deepEqual(event.bonusChanges, Object.fromEntries(Object.entries(expected).filter(([, delta]) => delta)));
  assert.equal(event.key, `9:1:${evolved.id}:evolve`);
});

test('same-color evolution omits a zero net permanent bonus', () => {
  const before = snapshot();
  before.players[0].cards = [clone(ordinary)];
  const after = clone(before);
  after.version++;
  after.players[0].cards = [{...evolved, bonus: ordinary.bonus}];
  after.players[0].evolved = [{hidden: true}];
  assert.deepEqual(acquisitionEvents(before, after)[0].bonusChanges, {});
});

test('capture of an evolved species without removing its prior stage is still capture', () => {
  const before = snapshot();
  before.players[0].cards = [clone(ordinary)];
  const [event] = acquisitionEvents(before, add(before, evolved));
  assert.equal(event.kind, 'capture');
  assert.equal(event.fromCard, null);
  assert.equal(event.pointsDelta, evolved.points);
});

test('initial, repeated and stale snapshots do not replay acquisitions', () => {
  const before = snapshot(), after = add(before);
  assert.deepEqual(acquisitionEvents(null, after), []);
  assert.deepEqual(acquisitionEvents(before, null), []);
  assert.deepEqual(acquisitionEvents(after, clone(after)), []);
  assert.deepEqual(acquisitionEvents(after, before), []);
  assert.deepEqual(acquisitionEvents(before, after), acquisitionEvents(before, clone(after)));
});

test('game resets and replaced player rosters do not animate a new collection', () => {
  const before = snapshot();
  before.players[0].cards = [clone(ordinary)];
  for (const reset of [
    after => {after.version = 0;},
    after => {after.turn = 0;},
    after => {after.first = 1;},
    after => {after.players[0].name = 'Replacement';},
    after => {after.players[0].cards = [clone(evolved)];},
  ]) {
    const after = add(before, special);
    reset(after);
    assert.deepEqual(acquisitionEvents(before, after), []);
  }
});

test('hidden fields are neither consulted nor copied into feedback events', () => {
  const before = snapshot(), after = add(before, special, 1);
  for (const state of [before, after]) {
    Object.defineProperty(state, 'decks', {get() {throw Error('private deck accessed');}});
    for (const player of state.players) {
      Object.defineProperty(player, 'reserved', {get() {throw Error('private reservation accessed');}});
      player.evolved = [new Proxy({hidden: true}, {get() {throw Error('face-down card accessed');}})];
    }
  }
  const events = acquisitionEvents(before, after);
  assert.equal(events.length, 1);
  assert.doesNotMatch(JSON.stringify(events), /hidden|reserved|decks/);
});
