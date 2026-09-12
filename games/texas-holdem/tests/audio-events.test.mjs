import test from 'node:test';
import assert from 'node:assert/strict';
import {PokerSoundEvents} from '../web/audio-events.js';
import {mergeRoomSnapshot} from '../web/room-sync.js';

const clone = value => structuredClone(value);
const kinds = cues => cues.map(cue => cue.kind);
function snapshot({hand = 1, actor = 2, phase = 'preflop', board = [], history, winner = 0} = {}) {
  return {
    handNumber: hand, currentPlayerIndex: actor, phase, board,
    history: history ?? [{id: 1, handNumber: hand, type: 'hand'}],
    lastResult: phase === 'complete' ? {winners: [{id: winner, amount: 120}]} : null,
    players: Array.from({length: 6}, (_, id) => ({id, isBot: id !== 0, isHuman: id === 0, hole: id === 0 ? ['As', 'Kd'] : [null, null]})),
  };
}
function append(state, type, extra = {}) {
  return {...clone(state), ...extra, history: [...state.history, {id: state.history.at(-1).id + 1, handNumber: state.handNumber, type}]};
}

test('first load, explicit restore, and reconnect snapshots establish quiet baselines', () => {
  for (const phase of ['preflop', 'complete']) {
    const events = new PokerSoundEvents(), state = snapshot({phase});
    assert.deepEqual(events.observe(state), []);
    assert.deepEqual(events.observe(clone(state)), []);
    assert.deepEqual(events.observe(append(state, 'raise'), {bootstrap: true}), []);
    events.reset();
    assert.deepEqual(events.observe(append(state, 'all-in')), []);
    assert.deepEqual(events.observe(null), []);
    assert.deepEqual(events.observe(state), []);
  }
});

test('a deliberate new game announces dealing and the viewer turn only once', () => {
  const events = new PokerSoundEvents(), state = snapshot({actor: 0});
  const cues = events.observe(state, {announce: true});
  assert.deepEqual(kinds(cues), ['deal', 'turn']);
  assert.ok(cues[1].delay > cues[0].delay);
  assert.deepEqual(events.observe(clone(state), {announce: true}), []);
  assert.deepEqual(new PokerSoundEvents().observe(state, {announce: true, bootstrap: true}), []);
});

test('each live action maps to one cue and repeated snapshots never repeat it', () => {
  for (const [action, cue] of [['check', 'check'], ['call', 'chips'], ['raise', 'raise'], ['all-in', 'all-in'], ['fold', 'fold']]) {
    const events = new PokerSoundEvents(), initial = snapshot();
    events.observe(initial);
    const changed = append(initial, action);
    assert.deepEqual(kinds(events.observe(changed)), [cue]);
    assert.deepEqual(events.observe(clone(changed)), []);
    assert.deepEqual(events.observe(initial), [], 'an older active snapshot cannot rewind the event cursor');
    assert.deepEqual(events.observe(changed), []);
  }
});

test('a slow snapshot sounds the latest action rather than every missed action', () => {
  const events = new PokerSoundEvents(), initial = snapshot();
  events.observe(initial);
  const changed = append(append(append(initial, 'call'), 'raise'), 'fold');
  assert.deepEqual(kinds(events.observe(changed)), ['fold']);
  assert.deepEqual(events.observe(append(changed, 'return')), []);
});

test('new public cards and the viewer turn get distinct ordered cues without metadata duplicates', () => {
  const events = new PokerSoundEvents(), initial = snapshot({actor: 4});
  events.observe(initial);
  const flop = append(initial, 'check', {phase: 'flop', board: ['2c', '3d', '4h'], currentPlayerIndex: 0});
  const cues = events.observe(flop);
  assert.deepEqual(kinds(cues), ['check', 'reveal', 'turn']);
  assert.ok(cues.every((cue, index) => index === 0 || cue.delay > cues[index - 1].delay));
  assert.deepEqual(events.observe({...clone(flop), deadline: 90000, serverNow: 1000}), []);
  assert.deepEqual(kinds(events.observe({...clone(flop), phase: 'turn', board: [...flop.board, '6s']})), ['reveal', 'turn']);
});

test('completion prioritizes one viewer-relative win or result cue, with a reveal for runouts', () => {
  for (const winner of [0, 3]) {
    const events = new PokerSoundEvents(), initial = snapshot({phase: 'flop', board: ['2c', '3d', '4h']});
    events.observe(initial);
    const complete = snapshot({phase: 'complete', actor: -1, board: ['2c', '3d', '4h', '6s', '8c'], winner, history: append(initial, 'all-in').history});
    assert.deepEqual(kinds(events.observe(complete)), ['reveal', winner === 0 ? 'win' : 'result']);
    assert.deepEqual(events.observe(clone(complete)), []);
  }
});

test('a newly completed hand is audible even when no intermediate snapshot arrived', () => {
  for (const winner of [0, 2]) {
    const events = new PokerSoundEvents();
    events.observe(snapshot({hand: 1, phase: 'complete'}));
    const complete = snapshot({hand: 2, phase: 'complete', winner});
    assert.deepEqual(kinds(events.observe(complete)), [winner === 0 ? 'win' : 'result']);
    assert.deepEqual(events.observe(complete), []);
    assert.deepEqual(new PokerSoundEvents().observe(complete), [], 'restored results remain quiet');
  }
});

test('next-hand dealing ignores prior-hand actions and hidden-card changes do not emit sounds', () => {
  const events = new PokerSoundEvents();
  events.observe(snapshot({phase: 'complete'}));
  const next = snapshot({hand: 2, actor: 5, history: [{id: 99, handNumber: 1, type: 'all-in'}, {id: 100, handNumber: 2, type: 'hand'}]});
  assert.deepEqual(kinds(events.observe(next)), ['deal']);
  const same = clone(next);
  same.players[0].hole = ['Qs', 'Jd'];
  same.players[1].hole = ['9c', '9d'];
  assert.deepEqual(events.observe(same), [], 'sound events depend on observable transitions, not card identities');
});

test('accepted lightweight polls, stale responses, and reconnect recovery do not replay cues', () => {
  const events = new PokerSoundEvents();
  let current = {
    room: {code: 'ABCDEF', selfId: 'viewer', version: 1, serverNow: 100, roster: [{seat: 0, connected: true}]},
    sync: {protocol: 2, scope: 'viewer', history: '0:0:0', unchanged: false},
    game: snapshot(), run: {history: []},
  };
  events.observe(current.game, {bootstrap: true});
  const poll = {room: {...current.room, serverNow: 200}, sync: {...current.sync, unchanged: true}};
  current = mergeRoomSnapshot(current, poll, 100).data;
  assert.deepEqual(events.observe(current.game), []);
  const action = {...clone(current), room: {...current.room, version: 2, serverNow: 300}, sync: {...current.sync, unchanged: false}, game: append(current.game, 'raise')};
  current = mergeRoomSnapshot(current, action, 200).data;
  assert.deepEqual(kinds(events.observe(current.game)), ['raise']);
  assert.equal(mergeRoomSnapshot(current, poll, 300).ignored, true);
  assert.deepEqual(events.observe(current.game), []);
  const recovered = append(append(current.game, 'call'), 'check', {currentPlayerIndex: 0});
  assert.deepEqual(events.observe(recovered, {bootstrap: true}), []);
  assert.deepEqual(kinds(events.observe(append(recovered, 'call', {currentPlayerIndex: 2}))), ['chips']);
});
