import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { createGame, stepGame, commandUnits, aiCommand, chooseCards, surrenderPlayer, summarize, CARDS, MAPS, MAX_UNITS, UNIT_TYPES, COLORS, cityCapacity, cityGarrisons, cityUpgradeProgress, cityRingRadius } from '../web/engine.js';

const clone = state => structuredClone(state);
function advance(state, seconds, bots = false) {
  for (let i = 0; i < Math.round(seconds * 10); i++) {
    if (bots && i % 12 === 0) for (const player of state.players) aiCommand(state, player.id);
    stepGame(state);
  }
  return state;
}
const mobilize = (options = {}, seconds = 4) => advance(createGame(options), seconds);

test('seeded maps and units reproduce exactly; all player counts and maps have valid bases', () => {
  for (const map of MAPS) for (const playerCount of [2, 3, 4, 5, 6, 7]) {
    const state = createGame({ mapId: map.id, playerCount, seed: 912 });
    assert.deepEqual(state, createGame({ mapId: map.id, playerCount, seed: 912 }));
    assert.equal(state.units.length, 0);
    assert.equal(state.cities.filter(city => city.owner < 0).length, playerCount * 3);
    for (const player of state.players) {
      assert.equal(state.cities.filter(city => city.owner === player.id).length, 1);
      assert.equal(state.units.filter(unit => unit.owner === player.id).length, 0);
      assert.equal(player.alive, true);
      assert.equal(state.cities.find(city => city.owner === player.id).country, ['秦', '齐', '楚', '赵', '韩', '燕', '魏'][player.id]);
      assert.equal(player.color, COLORS[player.id]);
    }
    advance(state, 1.6);
    assert.equal(state.units.length, 0); assert.equal(state.status, 'playing');
    assert.ok(state.players.every(player => player.alive));
  }
  assert.notDeepEqual(createGame({ seed: 1 }).cities, createGame({ seed: 2 }).cities);
  assert.throws(() => createGame({ playerCount: 8 }));
  assert.throws(() => createGame({ mapId: 'missing' }));
  assert.throws(() => createGame({ seed: NaN }));
});

test('seeded maps grow with player count and scatter distinct towns across all quadrants', () => {
  for (const mapId of MAPS.map(map => map.id)) for (let seed = 1; seed <= 24; seed++) {
    let previous = { width: 0, height: 0, cities: [] };
    for (let playerCount = 2; playerCount <= 7; playerCount++) {
      const state = createGame({ playerCount, seed, mapId });
      assert.equal(state.width, 1200 + (playerCount - 2) * 240); assert.equal(state.height, 760 + (playerCount - 2) * 152);
      assert.equal(state.cities.length, playerCount * 4);
      assert.ok(state.width > previous.width && state.height > previous.height && state.cities.length > previous.cities.length);
      assert.equal(new Set(state.cities.map(city => city.id)).size, state.cities.length);
      assert.equal(new Set(state.cities.map(city => city.name)).size, state.cities.length);
      for (const city of state.cities) assert.ok(city.x >= 120 && city.x <= state.width - 120 && city.y >= 120 && city.y <= state.height - 120);
      for (let i = 0; i < state.cities.length; i++) for (let j = i + 1; j < state.cities.length; j++) assert.ok(Math.hypot(state.cities[i].x - state.cities[j].x, state.cities[i].y - state.cities[j].y) >= 200);
      const neutral = state.cities.filter(city => city.owner === -1);
      assert.equal(new Set(neutral.map(city => `${city.x < state.width / 2 ? 'left' : 'right'}-${city.y < state.height / 2 ? 'top' : 'bottom'}`)).size, 4);
      assert.ok(Math.max(...neutral.map(city => city.x)) - Math.min(...neutral.map(city => city.x)) >= state.width * 0.55);
      assert.ok(Math.max(...neutral.map(city => city.y)) - Math.min(...neutral.map(city => city.y)) >= state.height * 0.5);
      for (const terrain of state.terrain) {
        if (terrain.type === 'river') {
          assert.ok(terrain.points.every(([x, y]) => x >= 0 && x <= state.width && y >= 0 && y <= state.height));
          assert.equal(terrain.points[0][1], 0); assert.equal(terrain.points.at(-1)[1], state.height);
          assert.ok(terrain.bridges.every(y => y >= 0 && y <= state.height));
        } else assert.ok(terrain.x >= 0 && terrain.y >= 0 && terrain.x + terrain.width <= state.width && terrain.y + terrain.height <= state.height);
      }
      previous = state;
    }
  }
  for (const mapId of ['river', 'passes']) {
    assert.notDeepEqual(createGame({ seed: 1, mapId }).terrain, createGame({ seed: 2, mapId }).terrain);
  }
});

test('empty armies begin natural city production without being eliminated', () => {
  const state = createGame({ playerCount: 7 });
  assert.equal(state.units.length, 0); assert.equal(state.nextUnitId, 1);
  assert.ok(state.cities.every(city => city.spawnCount === 0 && city.spawnProgress === 0));
  assert.throws(() => commandUnits(state, 0, [], { x: 600, y: 380 }));
  advance(state, 1.6); assert.equal(state.units.length, 0); assert.equal(state.status, 'playing');
  advance(state, 0.4); assert.equal(state.units.length, 7);
  assert.ok(state.players.every(player => player.alive && state.units.filter(unit => unit.owner === player.id).length === 1));
  assert.ok(state.units.every(unit => UNIT_TYPES[unit.type] && unit.hp === unit.maxHp));
  advance(state, 1.8); assert.equal(state.units.length, 14);
});

test('city levels stop production at one, two or three garrison rings and resume after departure', () => {
  // Isolate one producer so formation geometry is not altered by battle deaths.
  for (const seed of [1, 117, 700]) for (const level of [1, 2, 3]) {
    const playerCount = 2, owner = 0;
    const state = createGame({ playerCount, seed }), city = state.cities.find(city => city.owner === owner);
    city.maxLevel = 3; city.level = level; city.upgradeUnits = level === 3 ? 40 : level === 2 ? 16 : 0; city.radius = 32 + city.upgradeUnits * 0.3;
    const enemy = state.cities.find(c => c.owner === 1);
    enemy.x = city.x < state.width / 2 ? state.width - 12 : 12; enemy.y = city.y < state.height / 2 ? state.height - 12 : 12;
    state.cities = [city, enemy];
    for (const other of state.cities) {
      if (other.owner >= 0 && other !== city) other.spawnProgress = -10000;
      if (other.owner === -1) other.hp = other.maxHp = 100000;
    }
    advance(state, 170);
    const troops = state.units.filter(unit => unit.owner === owner);
    assert.equal(troops.length, [16, 40, 72][level - 1]); assert.equal(city.spawnCount, cityCapacity(city));
    assert.equal(cityGarrisons(state).get(city.id).length, cityCapacity(city));
    assert.equal(new Set(troops.map(u => u.garrisonSlot)).size, troops.length);
    assert.ok(troops.every(u => Math.hypot(u.x - city.x, u.y - city.y) <= cityRingRadius(city, level - 1) + 0.01));
    for (let i = 0; i < troops.length; i++) for (let j = i + 1; j < troops.length; j++) assert.ok(Math.hypot(troops[i].x - troops[j].x, troops[i].y - troops[j].y) > 17);
    commandUnits(state, owner, [troops[0].id], { x: state.width / 2, y: state.height / 2 });
    stepGame(state); assert.equal(city.spawnCount, cityCapacity(city) + 1, 'a departing garrison frees a slot and production resumes');
    assert.equal(cityGarrisons(state).get(city.id).length, cityCapacity(city));
  }
});

test('garrison rings continuously orbit without changing capacity and marching or feeding cancels patrol', () => {
  for (const level of [1, 2, 3]) {
    const s = createGame({seed:117,mapId:'plains'}), home = s.cities.find(c=>c.owner===0), enemy=s.cities.find(c=>c.owner===1);
    home.x=400;home.y=380;home.maxLevel=3;home.level=level;home.upgradeUnits=level===3?40:level===2?16:0;
    enemy.x=1100;enemy.y=650;enemy.spawnProgress=-10000;s.cities=[home,enemy];
    advance(s,170);const before=clone(s), troops=cityGarrisons(s).get(home.id);assert.equal(troops.length,cityCapacity(home));
    advance(s,2);assert.equal(home.spawnCount,before.cities[0].spawnCount,'orbiting does not open extra production slots');
    for(const u of troops){const old=before.units.find(v=>v.id===u.id),a=Math.atan2(old.y-home.y,old.x-home.x),b=Math.atan2(u.y-home.y,u.x-home.x),delta=Math.atan2(Math.sin(b-a),Math.cos(b-a));
      assert.ok(Math.abs(delta-.56)<.001);assert.ok(Math.abs(Math.hypot(u.x-home.x,u.y-home.y)-Math.hypot(old.x-home.x,old.y-home.y))<.01);assert.equal(u.target,null);
    }
    const marcher=troops[0],destination={x:900,y:380};commandUnits(s,0,[marcher.id],destination);assert.equal(marcher.garrisonCityId,undefined);
    const distance=Math.hypot(marcher.x-destination.x,marcher.y-destination.y);stepGame(s);assert.ok(Math.hypot(marcher.x-destination.x,marcher.y-destination.y)<distance);
    const feeder=troops[1];home.hp=home.maxHp-30;commandUnits(s,0,[feeder.id],home,{cityId:home.id});advance(s,3);assert.ok(!s.units.some(u=>u.id===feeder.id));assert.ok(home.hp>home.maxHp-30);
  }
});

test('random city ceilings include all three levels, start at one, and reproduce by seed', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const state = createGame({ seed });
    assert.deepEqual(new Set(state.cities.map(c => c.maxLevel)), new Set([1, 2, 3]));
    assert.ok(state.cities.every(c => c.level === 1 && c.upgradeUnits === 0 && cityCapacity(c) === 16));
    assert.deepEqual(state.cities, createGame({ seed }).cities);
  }
  assert.notDeepEqual(createGame({ seed: 1 }).cities.map(c => c.maxLevel), createGame({ seed: 2 }).cities.map(c => c.maxLevel));
});

function feedArmy(state, city, count) {
  const template = state.units.find(unit => unit.owner === city.owner);
  assert.ok(template);
  const units = Array.from({ length: count }, () => ({ ...template, id: state.nextUnitId++, x: city.x, y: city.y, target: null }));
  for (const unit of units) { delete unit.cityOrder; delete unit.garrisonCityId; delete unit.garrisonSlot; }
  state.units.push(...units);
  commandUnits(state, city.owner, units.map(u => u.id), city, { cityId: city.id });
  stepGame(state);
  return units;
}

test('feeding walks to a friendly city, heals first, then grows per soldier and unlocks capacity only at breakthroughs', () => {
  const state = mobilize({ mapId: 'plains' }), city = state.cities.find(c => c.owner === 0);
  city.maxLevel = 3; city.hp = city.maxHp - 30;
  const unit = state.units.find(u => u.owner === 0), unitsBefore = state.units.length;
  commandUnits(state, 0, [unit.id], city, { cityId: city.id });
  stepGame(state); assert.equal(state.units.length, unitsBefore, 'remote troops must arrive before being consumed');
  advance(state, 1); assert.ok(!state.units.some(u => u.id === unit.id)); assert.ok(city.hp > city.maxHp - 30); assert.equal(city.upgradeUnits, 0);
  feedArmy(state, city, 2); assert.equal(city.hp, city.maxHp); assert.equal(city.upgradeUnits, 1, 'the next soldier upgrades only after health is full');
  assert.equal(city.radius, 32.3); assert.equal(city.maxHp, 168); assert.equal(cityCapacity(city), 16);
  feedArmy(state, city, 14); assert.equal(city.level, 1); assert.deepEqual(cityUpgradeProgress(city), { current: 15, needed: 16 });
  feedArmy(state, city, 1); assert.equal(city.level, 2); assert.equal(cityCapacity(city), 40); assert.equal(city.maxHp, 288);
  feedArmy(state, city, 23); assert.equal(city.level, 2); assert.deepEqual(cityUpgradeProgress(city), { current: 23, needed: 24 });
  feedArmy(state, city, 1); assert.equal(city.level, 3); assert.equal(cityCapacity(city), 72); assert.equal(city.maxHp, 480); assert.equal(city.radius, 44);
  const extra = feedArmy(state, city, 3); assert.ok(extra.every(u => state.units.some(living => living.id === u.id))); assert.equal(city.upgradeUnits, 40, 'full max-level cities never waste soldiers');
  city.hp -= 1; const healing = feedArmy(state, city, 2); assert.ok(!state.units.some(u => u.id === healing[0].id)); assert.ok(state.units.some(u => u.id === healing[1].id)); assert.equal(city.hp, city.maxHp);
});

test('feeding authorization is atomic, can be cancelled, and never consumes soldiers for a captured city', () => {
  const state = mobilize(), own = state.units.find(u => u.owner === 0), home = state.cities.find(c => c.owner === 0), enemy = state.cities.find(c => c.owner === 1), before = clone(state);
  assert.throws(() => commandUnits(state, 0, [own.id], enemy, { cityId: enemy.id }), /己方城池/); assert.deepEqual(state, before);
  assert.throws(() => commandUnits(state, 0, [own.id], home, { cityId: 9999 }), /己方城池/); assert.deepEqual(state, before);
  commandUnits(state, 0, [own.id], home, { cityId: home.id });
  commandUnits(state, 0, [own.id], { x: 12, y: 12 }); assert.equal(own.cityOrder, undefined);
  commandUnits(state, 0, [own.id], home, { cityId: home.id }); home.owner = 1; home.hp -= 50;
  Object.assign(own, { x: home.x, y: home.y, attackCooldown: 10 });
  const anotherHome = state.cities.find(c => c.owner === -1); anotherHome.owner = 0;
  stepGame(state); assert.ok(state.units.some(u => u.id === own.id)); assert.equal(own.cityOrder, undefined); assert.equal(home.upgradeUnits, 0);
});

test('upgraded cities keep their ceiling, size and investment when captured, surrendered or restored', () => {
  const state = mobilize({ playerCount: 4, cards: [['bastion'], [], [], []] }), city = state.cities.find(c => c.owner === 0);
  city.maxLevel = 2; feedArmy(state, city, 16); assert.equal(city.level, 2); assert.equal(city.maxHp, 388.8);
  const restored = clone(state); stepGame(state); stepGame(restored); assert.deepEqual(state, restored);
  const enemy = state.units.find(u => u.owner === 1); state.units = [enemy]; Object.assign(enemy, { x: city.x - 35, y: city.y, attackCooldown: 0 }); city.hp = 1;
  stepGame(state); assert.equal(city.owner, 1); assert.equal(city.level, 2); assert.equal(city.maxLevel, 2); assert.equal(city.maxHp, 288); assert.equal(city.radius, 36.8);
  surrenderPlayer(state, 1); assert.equal(city.owner, -1); assert.equal(city.maxHp, 228); assert.equal(city.level, 2); assert.equal(city.maxLevel, 2);
});

test('commands enforce ownership, bounds, live ids, and atomic validation', () => {
  const state = mobilize(), own = state.units.find(unit => unit.owner === 0), enemy = state.units.find(unit => unit.owner === 1), before = clone(state);
  for (const [ids, point] of [[[own.id, enemy.id], { x: 10, y: 10 }], [[own.id], { x: NaN, y: 10 }], [[own.id], { x: -1, y: 10 }], [[own.id, own.id], { x: 10, y: 10 }], [[9999], { x: 10, y: 10 }]]) {
    assert.throws(() => commandUnits(state, 0, ids, point)); assert.deepEqual(state, before);
  }
  commandUnits(state, 0, [own.id], { x: 450, y: 380 });
  assert.deepEqual(own.target, { x: 450, y: 380 });
  const beforeDistance = Math.hypot(own.x - 450, own.y - 380); stepGame(state); assert.ok(Math.hypot(own.x - 450, own.y - 380) < beforeDistance);
});

test('fixed stepping produces the same state with batched or fractional frame times', () => {
  const a = createGame({ seed: 'same' }), b = clone(a), c = clone(a);
  for (let i = 0; i < 30; i++) stepGame(a, 0.1);
  for (let i = 0; i < 3; i++) stepGame(b, 1);
  for (let i = 0; i < 300; i++) stepGame(c, 0.01);
  assert.deepEqual(a, b); assert.deepEqual(a, c); assert.equal(a.tick, 30); assert.equal(a.time, 3);
  for (const dt of [-1, Infinity, NaN, 3]) assert.throws(() => stepGame(a, dt));
});

test('zero-army games preserve deterministic full-state combat snapshots', () => {
  // The zero-army starting rule is covered along with three terrains, all card
  // effects, production, fighting, movement, captures and faction elimination.
  const cases = [
    { seed: 117, playerCount: 2, mapId: 'river', hashes: ['32817fa474351a6bcb47bbb306f02c34fefe614ce81b703e974d5ca99939b8c6', '3be1241020993c14ac2ee04ca1a368078e0c86cf98154c509a040b0d0147b59a', 'd832a217cc4f7db1c65f1bab866a747704eaf589616a1e9d3c216cef4c4f499a', '2b5e87f0d4d69bdbc113360fd5cb9d79c8a9b565580349fc36fc3a37c04b2a4c'] },
    { seed: 912, playerCount: 4, mapId: 'passes', hashes: ['ec379ac2432d1ed025e568fc3448c99c3fdc5b63fde1acfd86bbf798bc178dd8', 'bd6f65f2259157c373be9b60a8871772b079b11ee7b57183e39842f6944b9ee2', 'def894739a4192c87c2bc67e010b9a55ffe8a50fb5b14220c37141dbb9175a24', '4dc0fbf90bcee08a54df9dda36b5dda56fbc456ae67d6c8ec979f6de6b88c3e5'] },
    { seed: 117, playerCount: 7, mapId: 'plains', hashes: ['04fb3ba647e459d18de3265f7db496ccd4d7822c16ee1ed92f0c24c4be2fe48e', 'ec8e3ca9b24d812de7ea9c0cfe628f76a1c4bf97cecf271b90a65165276c2e7d', '83be4679ed4c5aa394e4b9354302592fb6b6ffd19e90a42b8998639ea6be7c4d', '542bb8a66c63e7e270046164ce59dde0760b1095d067df672a7bba81002c74dd'] },
  ];
  for (const { seed, playerCount, mapId, hashes } of cases) {
    const cards = Array.from({ length: playerCount }, (_, id) => chooseCards(seed + id, 3).map(card => card.id));
    const state = createGame({ seed, playerCount, mapId, cards }), actual = [];
    for (let tick = 0; tick < 600; tick++) {
      if (tick % 12 === 0) for (const player of state.players) aiCommand(state, player.id);
      stepGame(state);
      if ([0, 99, 299, 599].includes(tick)) actual.push(createHash('sha256').update(JSON.stringify(state)).digest('hex'));
    }
    assert.deepEqual(actual, hashes, `${playerCount}-faction ${mapId} simulation must retain every state field`);
  }
});

test('skills are deterministic, distinct and change troop stats, movement and production', () => {
  assert.deepEqual(chooseCards(17), chooseCards(17)); assert.equal(new Set(chooseCards(17, CARDS.length).map(card => card.id)).size, CARDS.length);
  assert.throws(() => createGame({ cards: [['unknown'], []] })); assert.throws(() => createGame({ cards: [['swift', 'swift'], []] }));
  const plain = mobilize({ seed: 8 }), skilled = mobilize({ seed: 8, cards: [['veteran', 'swift', 'levy'], []] });
  assert.equal(skilled.units[0].maxHp, plain.units[0].maxHp * 1.2);
  for (const state of [plain, skilled]) {
    state.cities = state.cities.filter(city => city.owner >= 0);
    Object.assign(state.units[0], { x: state.width / 2, y: state.height / 2 });
    commandUnits(state, 0, [state.units[0].id], { x: state.width * 0.75, y: state.height / 2 });
  }
  const start = { x: plain.units[0].x, y: plain.units[0].y };
  stepGame(plain); stepGame(skilled);
  assert.ok(Math.hypot(skilled.units[0].x - start.x, skilled.units[0].y - start.y) > Math.hypot(plain.units[0].x - start.x, plain.units[0].y - start.y));
  for (const state of [plain, skilled]) {
    const city = state.cities.find(city => city.owner === 0);
    Object.assign(state.units[0], { x: city.x, y: city.y, target: null });
  }
  advance(plain, 6); advance(skilled, 6);
  assert.ok(skilled.units.filter(unit => unit.owner === 0).length > plain.units.filter(unit => unit.owner === 0).length);
  const bastion = createGame({ cards: [['bastion'], []] }); assert.equal(bastion.cities[0].maxHp, 216);
});

test('nearby soldiers fight automatically and casualties resolve simultaneously', () => {
  const state = mobilize();
  state.cities = [];
  const a = { ...state.units[0], type: 'blade', x: state.width / 2, y: state.height / 2, hp: 5, attackCooldown: 0 }, b = { ...state.units.find(unit => unit.owner === 1), type: 'blade', x: state.width / 2 + 15, y: state.height / 2, hp: 5, attackCooldown: 0 };
  state.units = [a, b];
  stepGame(state);
  assert.equal(state.units.length, 0); assert.equal(state.status, 'finished'); assert.equal(state.winner, null);
  assert.deepEqual(state.players.map(player => player.alive), [false, false]);
});

test('a command away from an enemy lets a soldier disengage from automatic combat', () => {
  const state = mobilize(), soldier = state.units[0], enemy = state.units.find(unit => unit.owner === 1);
  state.units = [soldier, enemy];
  Object.assign(soldier, { x: state.width / 2, y: state.height / 2, attackCooldown: 0 });
  Object.assign(enemy, { x: state.width / 2 + 20, y: state.height / 2, attackCooldown: 0 });
  commandUnits(state, 0, [soldier.id], { x: state.width * 0.2, y: state.height / 2 });
  stepGame(state); assert.ok(soldier.x < state.width / 2); assert.equal(soldier.attacking, false);
});

test('marching armies capture neutral cities and those cities produce reinforcements', () => {
  const state = mobilize({ seed: 2 }, 24), home = state.cities.find(city => city.owner === 0);
  const target = state.cities.filter(city => city.owner === -1).sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y))[0];
  commandUnits(state, 0, state.units.filter(unit => unit.owner === 0).map(unit => unit.id), target);
  advance(state, 20);
  assert.equal(target.owner, 0); assert.ok(target.hp > 0); assert.equal(target.maxHp, 160);
  assert.ok(state.events.some(event => event.type === 'capture' && event.cityId === target.id));
  assert.ok(target.spawnCount > 0);
});

test('last-city capture ends a two-player match and locks further actions', () => {
  const state = mobilize(), enemyCity = state.cities.find(city => city.owner === 1);
  state.cities = state.cities.filter(city => city.owner >= 0);
  state.units = state.units.filter(unit => unit.owner === 0);
  for (const unit of state.units) { unit.x = enemyCity.x - 35; unit.y = enemyCity.y; unit.attackCooldown = 0; }
  enemyCity.hp = 1; stepGame(state);
  assert.equal(enemyCity.owner, 0); assert.equal(state.status, 'finished'); assert.equal(state.winner, 0);
  const before = clone(state); stepGame(state, 1); assert.deepEqual(state, before);
  assert.throws(() => commandUnits(state, 0, [state.units[0].id], { x: 1, y: 1 }));
});

test('losing the last city immediately defeats a faction with living field troops', () => {
  const state = mobilize({ playerCount: 3 }), enemyCity = state.cities.find(city => city.owner === 1);
  const survivor = state.units.find(unit => unit.owner === 1), attacker = state.units.find(unit => unit.owner === 0);
  state.units = state.units.filter(unit => unit.owner !== 1 || unit.id === survivor.id);
  Object.assign(survivor, { x: 12, y: state.height - 12, attackCooldown: 0 });
  Object.assign(attacker, { x: enemyCity.x - 35, y: enemyCity.y, attackCooldown: 0 });
  enemyCity.hp = 1;
  stepGame(state);
  assert.equal(enemyCity.owner, 0); assert.ok(survivor.hp > 0);
  assert.equal(state.players[1].alive, false); assert.ok(!state.units.some(unit => unit.owner === 1));
  assert.equal(state.status, 'playing'); assert.equal(state.winner, null);
  assert.ok(state.events.some(event => event.type === 'eliminated' && event.playerId === 1));
  assert.throws(() => commandUnits(state, 1, [survivor.id], { x: 600, y: 380 }));
});

test('retreat regenerates near friendly cities and siege cards increase city damage', () => {
  const regen = mobilize({ cards: [['renewal'], []] }), unit = regen.units[0];
  unit.hp = unit.maxHp - 5; const hp = unit.hp; advance(regen, 1); assert.ok(unit.hp > hp);
  const a = mobilize(), b = mobilize({ cards: [['siege'], []] });
  for (const state of [a, b]) {
    const city = state.cities.find(item => item.owner === -1);
    state.units = [state.units[0], state.units.find(item => item.owner === 1)];
    Object.assign(state.units[0], { x: city.x - 35, y: city.y, attackCooldown: 0 });
    stepGame(state);
  }
  assert.ok(b.cities.find(city => city.owner === -1).hp < a.cities.find(city => city.owner === -1).hp);
});

test('surrender removes army, frees cities and immediately ends a two-player match', () => {
  const state = mobilize(); surrenderPlayer(state, 1);
  assert.equal(state.status, 'finished'); assert.equal(state.winner, 0); assert.equal(state.players[1].alive, false);
  assert.ok(!state.units.some(unit => unit.owner === 1)); assert.ok(!state.cities.some(city => city.owner === 1));
  assert.ok(state.cities.every(city => city.owner === 0));
  assert.throws(() => surrenderPlayer(state, 0));
  const multi = createGame({ playerCount: 4 }); surrenderPlayer(multi, 2); assert.equal(multi.status, 'playing');
});

test('long deterministic AI matches stay bounded and conquer cities without random frame decisions', () => {
  const a = createGame({ playerCount: 4, seed: 23 }), b = clone(a);
  advance(a, 80, true); advance(b, 80, true); assert.deepEqual(a, b);
  assert.ok(a.events.some(event => event.type === 'capture')); assert.ok(a.units.length <= MAX_UNITS);
  assert.equal(new Set(a.units.map(unit => unit.id)).size, a.units.length);
  for (const unit of a.units) { assert.ok(unit.hp > 0 && unit.hp <= unit.maxHp); assert.ok(Number.isFinite(unit.x) && Number.isFinite(unit.y)); assert.ok(unit.x >= 0 && unit.x <= a.width && unit.y >= 0 && unit.y <= a.height); }
  const summary = summarize(a); assert.equal(summary.reduce((sum, player) => sum + player.units, 0), a.units.length);
});

test('every supported faction count can finish a complete AI battle with a sole city owner', () => {
  for (let playerCount = 2; playerCount <= 7; playerCount++) {
    const state = createGame({ playerCount, seed: 1 });
    // Diminishing recruitment slows long wars; retain a finite complete-battle
    // regression with the same seed and a thirty-minute simulation budget.
    for (let i = 0; i < 18000 && state.status === 'playing'; i++) {
      if (i % 12 === 0) for (const player of state.players) aiCommand(state, player.id);
      stepGame(state);
      assert.ok(state.units.length <= MAX_UNITS);
    }
    assert.equal(state.status, 'finished', `${playerCount} factions should finish within thirty simulated minutes`);
    assert.ok(Number.isInteger(state.winner));
    assert.ok(state.cities.every(city => city.owner === state.winner && city.country === state.players[state.winner].country));
    assert.ok(state.units.every(unit => unit.owner === state.winner));
  }
});

test('700 simultaneous combatants stay finite, bounded and within the room tick budget', t => {
  const state = mobilize({ playerCount: 7, seed: 700 }), templates = [...state.units], initialTick = state.tick;
  while (state.units.length < MAX_UNITS) {
    const template = templates[state.units.length % templates.length];
    state.units.push({ ...template, id: state.nextUnitId++ });
  }
  state.units.forEach((unit, index) => Object.assign(unit, { x: state.width / 2 - 10 + index % 25 * 0.5, y: state.height / 2 - 10 + Math.floor(index / 25) * 0.5, hp: 100000, maxHp: 100000, attackCooldown: 0 }));
  const started = performance.now();
  for (let i = 0; i < 100; i++) stepGame(state);
  const elapsed = performance.now() - started;
  t.diagnostic(`700-soldier stress: ${(elapsed / 100).toFixed(2)} ms per 100 ms simulation tick`);
  assert.ok(elapsed < 8000, 'the 10 Hz room authority needs each tick to fit its time budget');
  assert.equal(state.units.length, MAX_UNITS); assert.equal(state.tick, initialTick + 100);
  assert.ok(state.units.every(unit => Number.isFinite(unit.hp) && Number.isFinite(unit.x) && Number.isFinite(unit.y)));
});
