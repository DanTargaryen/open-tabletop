import test from 'node:test';
import assert from 'node:assert/strict';
import {PokerAudio, bindPokerAudio} from '../web/audio.js';

function parameter() {
  return {value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}};
}
function mockContext() {
  const context = {state: 'suspended', sampleRate: 48000, currentTime: 10, destination: {}, nodes: [], sources: [], resumes: 0, suspends: 0};
  const node = (source = false) => {
    const value = {
      gain: parameter(), frequency: parameter(), Q: parameter(), connections: [], starts: [], stops: [], onended: null,
      connect(target) { this.connections.push(target); },
      disconnect() { this.connections = []; },
      start(at) { if (context.failStart) throw Error('audio device unavailable'); this.starts.push(at); },
      stop(at) { this.stops.push(at); },
      end() { this.onended?.(); },
    };
    context.nodes.push(value);
    if (source) context.sources.push(value);
    return value;
  };
  context.createGain = () => node();
  context.createOscillator = () => node(true);
  context.createBufferSource = () => node(true);
  context.createBiquadFilter = () => node();
  context.createBuffer = (_channels, length) => {
    const samples = new Float32Array(length);
    return {getChannelData: () => samples};
  };
  context.resume = async () => { context.resumes++; context.state = 'running'; };
  context.suspend = async () => { context.suspends++; context.state = 'suspended'; };
  return context;
}
function setup() {
  const context = mockContext();
  let hidden = false, creates = 0;
  const audio = new PokerAudio({createContext: () => { creates++; return context; }, isHidden: () => hidden});
  return {context, audio, creates: () => creates, setHidden: value => { hidden = value; }};
}
function target() {
  const listeners = new Map();
  return {
    addEventListener(name, listener) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(listener); },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    emit(name) { for (const listener of listeners.get(name) ?? []) listener(); },
    count() { return [...listeners.values()].reduce((sum, entries) => sum + entries.size, 0); },
  };
}
const stopped = source => source.stops.includes(undefined) && source.connections.length === 0 && source.onended === null;

test('audio is lazy, muted or hidden playback is discarded, and unlock does not replay a backlog', async () => {
  const f = setup();
  assert.equal(f.audio.play('deal'), false);
  assert.equal(f.creates(), 0);
  f.audio.setEnabled(false);
  assert.equal(await f.audio.unlock(), false);
  assert.equal(f.creates(), 0);
  f.audio.setEnabled(true); f.setHidden(true);
  assert.equal(await f.audio.unlock(), false);
  assert.equal(f.creates(), 0);
  f.setHidden(false);
  assert.equal(await f.audio.unlock(), true);
  assert.equal(f.context.sources.length, 0);
  assert.equal(f.audio.play('deal'), true);
  const sources = [...f.context.sources];
  f.audio.setEnabled(false);
  assert.equal(f.audio.voices.size, 0);
  assert.ok(sources.every(stopped));
  f.audio.setEnabled(true);
  assert.equal(await f.audio.unlock(), true);
  assert.equal(f.context.sources.length, sources.length);
  assert.equal(f.creates(), 1);
});

test('all supported cues schedule finite nonzero audio and repeated immediate cues are throttled', async () => {
  const f = setup(); await f.audio.unlock();
  assert.ok(f.audio.noiseBuffer.getChannelData(0).some(sample => sample !== 0));
  for (const kind of ['deal', 'reveal', 'fold', 'check', 'chips', 'raise', 'all-in', 'turn', 'win', 'result']) {
    f.context.currentTime += 1;
    const before = f.context.sources.length;
    assert.equal(f.audio.play(kind, {delay: .2}), true, kind);
    const sources = f.context.sources.slice(before);
    assert.ok(sources.length > 0, kind);
    assert.ok(sources.every(source => Number.isFinite(source.starts[0]) && source.starts[0] >= f.context.currentTime));
    assert.ok(sources.every(source => source.stops.some(at => Number.isFinite(at) && at > source.starts[0])));
    assert.equal(f.audio.play(kind, {delay: .2}), false);
    assert.equal(f.context.sources.length, before + sources.length);
  }
  const before = f.context.sources.length;
  assert.equal(f.audio.play('unknown'), false);
  assert.equal(f.context.sources.length, before);
});

test('completed voices release every connected node and bursts have a bounded voice count', async () => {
  const f = setup(); await f.audio.unlock();
  f.audio.play('raise');
  const first = [...f.audio.voices];
  for (const voice of first) voice.source.end();
  assert.equal(f.audio.voices.size, 0);
  assert.ok(first.every(voice => voice.nodes.every(node => node.connections.length === 0)));
  for (let i = 0; i < 12; i++) { f.context.currentTime += .2; assert.equal(f.audio.play('all-in'), true); assert.ok(f.audio.voices.size <= 18); }
  assert.ok(f.context.sources.some(stopped), 'old voices must be stopped when a burst reaches its cap');
  f.audio.stop();
  assert.equal(f.audio.voices.size, 0);
  assert.ok(f.context.sources.every(source => source.connections.length === 0));
});

test('hide and teardown cancel already scheduled sounds, including notes in the future', async () => {
  const f = setup(), doc = target(), unbind = bindPokerAudio(f.audio, doc);
  assert.equal(f.creates(), 0);
  doc.emit('pointerdown'); await Promise.resolve();
  assert.equal(f.audio.unlocked, true);
  f.audio.play('win', {delay: .5});
  const sources = [...f.context.sources];
  assert.ok(sources.some(source => source.starts[0] > f.context.currentTime));
  f.setHidden(true); doc.emit('visibilitychange');
  assert.equal(f.audio.voices.size, 0);
  assert.ok(sources.every(stopped));
  assert.equal(f.context.suspends, 1);
  assert.equal(f.audio.play('chips'), false);
  f.setHidden(false); doc.emit('visibilitychange'); await Promise.resolve();
  assert.equal(f.context.sources.length, sources.length);
  assert.equal(f.audio.play('check'), true);
  const active = [...f.audio.voices];
  unbind();
  assert.equal(doc.count(), 0);
  assert.equal(f.audio.voices.size, 0);
  assert.ok(active.every(voice => stopped(voice.source)));
  doc.emit('keydown');
  assert.equal(f.creates(), 1);
});

test('returning to an untouched tab does not create an AudioContext without a gesture', () => {
  const f = setup();
  f.setHidden(true); f.audio.visibilityChanged();
  f.setHidden(false); f.audio.visibilityChanged();
  assert.equal(f.creates(), 0);
});

test('unavailable audio and rejected resumes fail quietly without producing sources', async () => {
  const unavailable = new PokerAudio({createContext() { throw Error('no Web Audio'); }, isHidden: () => false});
  assert.equal(await unavailable.unlock(), false);
  assert.equal(unavailable.play('turn'), false);
  assert.doesNotThrow(() => unavailable.visibilityChanged());
  const f = setup(); f.context.resume = async () => { throw Error('autoplay denied'); };
  assert.equal(await f.audio.unlock(), false);
  assert.equal(f.audio.play('win'), false);
  assert.equal(f.context.sources.length, 0);
});

test('a source scheduling failure releases partially started cues and leaves the game usable', async () => {
  const f = setup(); await f.audio.unlock();
  f.context.failStart = true;
  assert.equal(f.audio.play('raise'), false);
  assert.equal(f.audio.voices.size, 0);
  assert.ok(f.context.sources.every(stopped));
  f.context.failStart = false;
  assert.equal(f.audio.play('raise'), true);
});

test('mute or hide during a pending resume invalidates that unlock attempt', async () => {
  for (const interruption of ['mute', 'hide']) {
    const f = setup(); let finish;
    f.context.resume = () => new Promise(resolve => { finish = () => { f.context.state = 'running'; resolve(); }; });
    const pending = f.audio.unlock();
    if (interruption === 'mute') f.audio.setEnabled(false);
    else { f.setHidden(true); f.audio.visibilityChanged(); }
    finish();
    assert.equal(await pending, false, interruption);
    assert.equal(f.audio.unlocked, false, interruption);
    assert.equal(f.audio.play('check'), false);
    assert.equal(f.context.sources.length, 0);
  }
});

test('starting or restoring a game during the first gesture resume preserves audio authorization', async () => {
  const f = setup(); let finish;
  f.context.resume = () => new Promise(resolve => { finish = () => { f.context.state = 'running'; resolve(); }; });
  const pending = f.audio.unlock();
  // UI resetAudio() stops old voices when start/restore handles the same gesture.
  f.audio.stop();
  assert.equal(f.audio.play('deal'), false, 'nothing queues while unlock is pending');
  finish();
  assert.equal(await pending, true);
  assert.equal(f.context.sources.length, 0, 'the missed deal is never replayed');
  assert.equal(f.audio.play('chips'), true, 'the next live action must not need a second gesture');
});

test('an old resume completion cannot revoke a newer successful unlock', async () => {
  const f = setup(), finishes = [];
  f.context.resume = () => new Promise(resolve => { finishes.push(() => { f.context.state = 'running'; resolve(); }); });
  const old = f.audio.unlock();
  f.audio.setEnabled(false);
  f.audio.setEnabled(true);
  const current = f.audio.unlock();
  finishes[1]();
  assert.equal(await current, true);
  finishes[0]();
  assert.equal(await old, false);
  assert.equal(f.audio.unlocked, true, 'a superseded request cannot overwrite current authorization');
  assert.equal(f.audio.play('turn'), true);
});

test('synthesis uses its own deterministic noise and never reads global game randomness', async () => {
  const first = setup(), second = setup(), random = Math.random;
  try {
    Math.random = () => { throw Error('game randomness consumed'); };
    assert.equal(await first.audio.unlock(), true);
    assert.equal(await second.audio.unlock(), true);
    assert.equal(first.audio.play('all-in'), true);
    assert.deepEqual(first.audio.noiseBuffer.getChannelData(0), second.audio.noiseBuffer.getChannelData(0));
  } finally { Math.random = random; }
});
