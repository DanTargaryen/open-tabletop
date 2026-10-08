// Deterministic ink-war rules shared by the browser and the room authority.
// Coordinates are world pixels; only stepGame advances simulation time.
import {CAPTURE_RECOVERY_SECONDS,productionPower,normalizeBalance,updateComebacks,activateComebackSkill,COMEBACK_SKILLS} from './balance.js';
export {CAPTURE_RECOVERY_SECONDS,productionPower,COMEBACK_SKILLS} from './balance.js';
export const TICK_SECONDS = 0.1;
export const MAX_UNITS = 700;
export const AI_DIFFICULTIES = [
  {id:'beginner',name:'入门',opening:12,interval:6,minArmy:6,reserve:.35},
  {id:'normal',name:'标准',opening:8,interval:4,minArmy:4,reserve:.2},
  {id:'hard',name:'挑战',opening:0,interval:0,minArmy:1,reserve:0},
];
export const CITY_RING_SIZES = [16, 24, 32];
export const CITY_UPGRADE_COSTS = [16, 24];
export const CITY_HEAL_PER_UNIT = 20;
export const CITY_HP_PER_UNIT = 8;
export const COLORS = ['#050505', '#dc1717', '#184fdb', '#e87504', '#00a9b5', '#a10cc6', '#cd00a8'];
export const UNIT_TYPES = {
  blade: { name: '刀兵', glyph: '刀', maxHp: 34, attack: 8, speed: 55, range: 23, cooldown: 0.85 },
  spear: { name: '枪兵', glyph: '枪', maxHp: 30, attack: 9, speed: 50, range: 37, cooldown: 1 },
  sword: { name: '剑士', glyph: '剑', maxHp: 29, attack: 7, speed: 67, range: 24, cooldown: 0.7 },
  shield: { name: '盾卫', glyph: '盾', maxHp: 58, attack: 5, speed: 40, range: 23, cooldown: 1.1 },
  bow: { name: '弓手', glyph: '弓', maxHp: 22, attack: 6, speed: 48, range: 110, cooldown: 1.25 },
};
export const MAPS = [
  { id: 'river', name: '山河对峙', description: '城池散布河谷，争夺渡口，沿岸分兵扩张。' },
  { id: 'plains', name: '逐鹿原野', description: '开阔原野，城池分散全境，适合多线分兵。' },
  { id: 'passes', name: '群山争雄', description: '随机山隘放慢行军，争夺散布全境的要塞与兵源。' },
];
export const CARDS = [
  { id: 'levy', name: '募兵令', glyph: '募', description: '所有城池出兵速度提高 25%。' },
  { id: 'swift', name: '疾行军', glyph: '疾', description: '全军移动速度提高 20%。' },
  { id: 'fierce', name: '锋芒毕露', glyph: '锋', description: '士兵造成的伤害提高 20%。' },
  { id: 'bastion', name: '固若金汤', glyph: '固', description: '城池生命提高 35%，守城伤害提高 25%。' },
  { id: 'arrows', name: '箭雨', glyph: '弓', description: '城池更常生产弓手，弓手射程提高 20%。' },
  { id: 'renewal', name: '休养生息', glyph: '养', description: '己方城池附近的士兵每秒恢复 2 点生命。' },
  { id: 'siege', name: '攻城拔寨', glyph: '破', description: '士兵对城池造成的伤害提高 35%。' },
  { id: 'veteran', name: '百战之师', glyph: '勇', description: '所有士兵的生命提高 20%。' },
];

const TYPE_IDS = Object.keys(UNIT_TYPES);
const COUNTRIES = ['秦', '齐', '楚', '赵', '韩', '燕', '魏'];
const CITY_NAMES = ['临江', '云关', '白鹿', '松原', '燕山', '青溪', '望川', '平津', '天阙', '长平', '东陵', '函谷', '雁门', '上党', '涿郡', '邯郸', '广陵', '武陵', '会稽', '江陵', '阳翟', '新郑', '寿春', '临淄', '蓟城', '安邑', '河间', '陈留'];
const MAX_PLAYER_UNITS = 150;
const CARD_IDS = new Set(CARDS.map(card => card.id));
const round = value => Math.round(value * 1e9) / 1e9;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const hasCard = (state, owner, card) => state.players[owner]?.cards.includes(card) || false;

function seedValue(seed) {
  if (typeof seed !== 'string' && (!Number.isSafeInteger(seed) || seed < 0)) throw Error('地图种子无效。');
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0 || 1;
}
function random(state) {
  state.rngState = (Math.imul(state.rngState, 1664525) + 1013904223) >>> 0;
  return state.rngState / 4294967296;
}
function log(state, type, text, extra = {}) {
  state.events.push({ id: ++state.eventId, tick: state.tick, type, text, ...extra });
  if (state.events.length > 40) state.events.splice(0, state.events.length - 40);
}

export function chooseCards(seed, count = 3) {
  if (!Number.isInteger(count) || count < 0 || count > CARDS.length) throw Error('卡牌数量无效。');
  const rng = { rngState: seedValue(seed) }, deck = [...CARDS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random(rng) * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, count).map(card => ({ ...card }));
}

function cityHp(state, owner, city = {}) {
  return round(((owner === -1 ? 100 : 160) + (city.upgradeUnits || 0) * CITY_HP_PER_UNIT) * (hasCard(state, owner, 'bastion') ? 1.35 : 1));
}
function normalizeCity(state, city) {
  // Persisted games from before city progression acquire deterministic limits.
  city.level ??= 1; city.maxLevel ??= 1 + seedValue(`${state.seed}:city:${city.id}`) % 3;
  city.upgradeUnits ??= 0; city.radius = round(32 + city.upgradeUnits * 0.3);
}
export function cityCapacity(city) { return CITY_RING_SIZES.slice(0, city.level || 1).reduce((sum, count) => sum + count, 0); }
export function cityUpgradeProgress(city) {
  const level = city.level || 1, previous = level === 2 ? CITY_UPGRADE_COSTS[0] : 0;
  return { current: level >= (city.maxLevel || 1) ? 0 : (city.upgradeUnits || 0) - previous, needed: level >= (city.maxLevel || 1) ? 0 : CITY_UPGRADE_COSTS[level - 1] };
}
export function cityRingRadius(city, ring) { return 67 + ring * 31 + (city.radius || 32) - 32; }
export function cityGarrisons(state) {
  const cities = new Map(), owners = [], result = new Map();
  for (const city of state.cities) {
    const radius = cityRingRadius(city, (city.level || 1) - 1) + 18, entry = { city, radius, radiusSquared: radius * radius };
    cities.set(city.id, entry); result.set(city.id, []);
    if (city.owner >= 0) (owners[city.owner] ||= []).push(entry);
  }
  for (const unit of state.units) {
    if (unit.hp <= 0 || unit.cityOrder !== undefined || unit.uncontrollable) continue;
    let entry = cities.get(unit.garrisonCityId), city = entry?.city;
    if (!city || city.owner !== unit.owner || distanceSquared(unit, city) > entry.radiusSquared) {
      if (unit.target) continue;
      city = null; let nearest = Infinity;
      for (const candidate of owners[unit.owner] || []) {
        const dx = unit.x - candidate.city.x, dy = unit.y - candidate.city.y;
        if (Math.abs(dx) > candidate.radius || Math.abs(dy) > candidate.radius) continue;
        const distance = dx * dx + dy * dy;
        if (distance <= candidate.radiusSquared && distance < nearest) { city = candidate.city; nearest = distance; }
      }
    }
    if (city) result.get(city.id).push(unit);
  }
  return result;
}
function garrisonPoint(state, city, slot) {
  let ring = 0, offset = slot;
  while (offset >= CITY_RING_SIZES[ring]) { offset -= CITY_RING_SIZES[ring]; ring++; }
  // Every ring shares a phase and angular speed, preserving slot spacing.
  const angle = city.id * 0.37 + offset * Math.PI * 2 / CITY_RING_SIZES[ring] + (ring % 2) * 0.085 + state.time * 0.28;
  const radius = cityRingRadius(city, ring), outer = cityRingRadius(city, (city.level || 1) - 1);
  const radiusX = radius * Math.min(1, (city.x - 12) / outer, (state.width - city.x - 12) / outer), radiusY = radius * Math.min(1, (city.y - 12) / outer, (state.height - city.y - 12) / outer);
  return { x: round(city.x + Math.cos(angle) * radiusX), y: round(city.y + Math.sin(angle) * radiusY), angle: round(angle) };
}
function freeSlot(city, troops) {
  const occupied = new Set(troops.map(unit => unit.garrisonSlot));
  for (let slot = 0; slot < cityCapacity(city); slot++) if (!occupied.has(slot)) return slot;
  return -1;
}
function layout(state, playerCount) {
  const margin = 120, minDistanceSquared = 200 ** 2;
  // Equal-angle perimeter homes give every faction the same starting role.
  // Best-candidate sampling fills the remaining space instead of clustering
  // neutral towns at the centre. A seed controls the rotation and every sample.
  for (let attempt = 0; attempt < 24; attempt++) {
    const phase = random(state) * Math.PI * 2;
    const homes = Array.from({ length: playerCount }, (_, index) => {
      const angle = phase + index * Math.PI * 2 / playerCount;
      return { x: state.width / 2 + Math.cos(angle) * (state.width / 2 - margin), y: state.height / 2 + Math.sin(angle) * (state.height / 2 - margin) };
    });
    const quadrants = [0, 1, 2, 3];
    for (let index = 3; index > 0; index--) {
      const other = Math.floor(random(state) * (index + 1));
      [quadrants[index], quadrants[other]] = [quadrants[other], quadrants[index]];
    }
    const points = [...homes];
    while (points.length < playerCount * 4) {
      let best = null, bestDistance = 0;
      const quadrant = quadrants[points.length - playerCount];
      for (let sample = 0; sample < 160; sample++) {
        const candidate = quadrant === undefined
          ? { x: margin + random(state) * (state.width - margin * 2), y: margin + random(state) * (state.height - margin * 2) }
          : { x: (quadrant % 2 ? state.width / 2 : margin) + random(state) * (state.width / 2 - margin),
            y: (quadrant >= 2 ? state.height / 2 : margin) + random(state) * (state.height / 2 - margin) };
        let nearest = Infinity;
        for (const point of points) nearest = Math.min(nearest, distanceSquared(candidate, point));
        if (nearest > bestDistance) { best = candidate; bestDistance = nearest; }
      }
      if (bestDistance < minDistanceSquared) break;
      points.push(best);
    }
    if (points.length === playerCount * 4) {
      const neutral = points.slice(playerCount);
      const spanX = Math.max(...neutral.map(point => point.x)) - Math.min(...neutral.map(point => point.x));
      const spanY = Math.max(...neutral.map(point => point.y)) - Math.min(...neutral.map(point => point.y));
      if (spanX >= state.width * 0.65 && spanY >= state.height * 0.52) return points;
    }
  }
  return fallbackLayout(state, playerCount);
}

function fallbackLayout(state, playerCount) {
  // A jittered grid guarantees completion even for an unlucky sample sequence.
  // Its closest unjittered centres are at least 260 px apart for 2–7 factions;
  // rotation preserves distance and the bounded jitter leaves over 200 px.
  const count = playerCount * 4, margin = 160;
  const columns = Math.ceil(Math.sqrt(count * state.width / state.height)), rows = Math.ceil(count / columns);
  const rotation = (random(state) - 0.5) * 0.04, cosine = Math.cos(rotation), sine = Math.sin(rotation);
  const candidates = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const dx = margin + column * (state.width - margin * 2) / (columns - 1) - state.width / 2;
    const dy = margin + row * (state.height - margin * 2) / (rows - 1) - state.height / 2;
    candidates.push({ x: state.width / 2 + dx * cosine - dy * sine + (random(state) - 0.5) * 18,
      y: state.height / 2 + dx * sine + dy * cosine + (random(state) - 0.5) * 18,
      perimeter: row === 0 || row === rows - 1 || column === 0 || column === columns - 1 });
  }
  const points = [], phase = random(state) * Math.PI * 2;
  for (let index = 0; index < playerCount; index++) {
    const angle = phase + index * Math.PI * 2 / playerCount;
    const ideal = { x: state.width / 2 + Math.cos(angle) * (state.width / 2 - margin), y: state.height / 2 + Math.sin(angle) * (state.height / 2 - margin) };
    const available = candidates.filter(point => point.perimeter);
    let nearest = available[0];
    for (const point of available) if (distanceSquared(point, ideal) < distanceSquared(nearest, ideal)) nearest = point;
    points.push({ x: nearest.x, y: nearest.y }); candidates.splice(candidates.indexOf(nearest), 1);
  }
  while (points.length < count) {
    const quadrant = points.length - playerCount;
    const inQuadrant = quadrant < 4 ? candidates.filter(point => (point.x < state.width / 2 ? 0 : 1) + (point.y < state.height / 2 ? 0 : 2) === quadrant) : candidates;
    const available = inQuadrant.length ? inQuadrant : candidates;
    let best = available[0], bestDistance = -1;
    for (const point of available) {
      let nearest = Infinity;
      for (const existing of points) nearest = Math.min(nearest, distanceSquared(point, existing));
      if (nearest > bestDistance) { best = point; bestDistance = nearest; }
    }
    points.push({ x: best.x, y: best.y }); candidates.splice(candidates.indexOf(best), 1);
  }
  return points;
}

function createTerrain(state) {
  const scale = state.width / 1200;
  if (state.mapId === 'river') {
    const points = Array.from({ length: 7 }, (_, index) => [state.width * (0.43 + random(state) * 0.14), state.height * index / 6]);
    state.terrain = [{ type: 'river', points, width: (38 + random(state) * 14) * scale,
      bridges: [state.height * (0.24 + random(state) * 0.1), state.height * (0.65 + random(state) * 0.1)] }];
  } else if (state.mapId === 'passes') {
    for (let index = 0; index < 2 + Math.floor(state.players.length / 2); index++) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const width = state.width * (0.035 + random(state) * 0.025), height = state.height * (0.13 + random(state) * 0.08);
        const ridge = { type: 'ridge', x: 20 + random(state) * (state.width - width - 40), y: 20 + random(state) * (state.height - height - 40), width, height };
        if (state.cities.some(city => {
          const closest = { x: clamp(city.x, ridge.x, ridge.x + width), y: clamp(city.y, ridge.y, ridge.y + height) };
          return distanceSquared(city, closest) < 52 ** 2;
        })) continue;
        state.terrain.push(ridge); break;
      }
    }
  }
}

export function createGame({ seed = 1, playerCount = 2, mapId = 'river', cards = [[], []], names = [], aiDifficulty = 'hard' } = {}) {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 7) throw Error('请选择 2–7 个阵营。');
  if (!MAPS.some(map => map.id === mapId)) throw Error('地图不存在。');
  if (!Array.isArray(cards) || !Array.isArray(names)) throw Error('阵营设置无效。');
  if (!AI_DIFFICULTIES.some(d=>d.id===aiDifficulty)) throw Error('人机难度无效。');
  const players = Array.from({ length: playerCount }, (_, id) => {
    const selected = cards[id] ?? [];
    if (!Array.isArray(selected) || selected.length > 3 || selected.some(card => !CARD_IDS.has(card)) || new Set(selected).size !== selected.length) throw Error('每个阵营最多携带三张不同的技能卡。');
    if (names[id] !== undefined && (typeof names[id] !== 'string' || names[id].length > 32)) throw Error('阵营名称无效。');
    return { id, name: names[id]?.trim() || COUNTRIES[id] + '国', country: COUNTRIES[id], color: COLORS[id], alive: true, cards: [...selected] };
  });
  const state = {
    schema: 1, width: 1200 + (playerCount - 2) * 240, height: 760 + (playerCount - 2) * 152, seed, rngState: seedValue(seed), mapId, players,
    cities: [], units: [], terrain: [], time: 0, tick: 0, status: 'playing', winner: null,
    events: [], eventId: 0, nextUnitId: 1, stepRemainder: 0, reinforcements: [],
  };
  if (aiDifficulty !== 'hard') state.aiDifficulty = aiDifficulty;
  for(const player of players)normalizeBalance(player);
  const locations = layout(state, playerCount), limits = locations.map((_, index) => index % 3 + 1);
  for (let index = limits.length - 1; index > 0; index--) {
    const other = Math.floor(random(state) * (index + 1)); [limits[index], limits[other]] = [limits[other], limits[index]];
  }
  locations.forEach(({ x, y }, id) => {
    const owner = id < playerCount ? id : -1;
    const maxHp = cityHp(state, owner);
    state.cities.push({ id, name: CITY_NAMES[id] || `城${id + 1}`, country: owner >= 0 ? COUNTRIES[owner] : '城', x: round(x), y: round(y),
      owner, hp: maxHp, maxHp, level: 1, maxLevel: limits[id], upgradeUnits: 0, spawnProgress: 0, attackCooldown: 0, spawnCount: 0, radius: 32 });
  });
  createTerrain(state);
  log(state, 'start', '战鼓已响，夺取城池，统一山河。');
  return state;
}

function spawnUnit(state, city, ownerCounts = null, troops = []) {
  if (state.units.length >= MAX_UNITS || (ownerCounts?.[city.owner] ?? state.units.filter(unit => unit.owner === city.owner).length) >= MAX_PLAYER_UNITS) return false;
  if (troops.length >= cityCapacity(city)) return false;
  const slot = freeSlot(city, troops); if (slot < 0) return false;
  const roll = random(state), type = hasCard(state, city.owner, 'arrows') && roll < 0.4 ? 'bow' : TYPE_IDS[Math.floor(roll * TYPE_IDS.length)];
  const stats = UNIT_TYPES[type], point = garrisonPoint(state, city, slot);
  const maxHp = stats.maxHp * (hasCard(state, city.owner, 'veteran') ? 1.2 : 1);
  state.units.push({ id: state.nextUnitId++, owner: city.owner, type, glyph: stats.glyph,
    x: point.x, y: point.y, garrisonCityId: city.id, garrisonSlot: slot,
    hp: maxHp, maxHp, target: null, attackCooldown: random(state) * 0.3, facing: point.angle, attacking: false });
  troops.push(state.units.at(-1));
  city.spawnCount++;
  if (ownerCounts) ownerCounts[city.owner]++;
  return true;
}

export function commandUnits(state, playerId, unitIds, point, { cityId = null } = {}) {
  if (state.status !== 'playing') throw Error('本局已经结束。');
  if (!Number.isInteger(playerId) || !state.players[playerId]?.alive) throw Error('阵营无法发出命令。');
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > state.width || point.y < 0 || point.y > state.height) throw Error('目的地超出地图。');
  if (!Array.isArray(unitIds) || !unitIds.length || unitIds.length > MAX_UNITS || new Set(unitIds).size !== unitIds.length) throw Error('请选择有效的部队。');
  const byId = new Map(state.units.map(unit => [unit.id, unit]));
  const units = unitIds.map(id => {
    const unit = byId.get(id);
    if (!Number.isInteger(id) || !unit || unit.owner !== playerId || unit.hp <= 0) throw Error('只能指挥己方存活的部队。');
    if (unit.uncontrollable) throw Error('突击兵自动作战，无法手动指挥或吞兵养城。');
    return unit;
  }).sort((a, b) => a.id - b.id);
  const city = cityId === null ? null : state.cities.find(city => city.id === cityId);
  if (cityId !== null && (!Number.isInteger(cityId) || !city || city.owner !== playerId)) throw Error('只能向己方城池送兵。');
  // Validate the whole order before touching any unit, then assign a small formation.
  const columns = Math.ceil(Math.sqrt(units.length));
  units.forEach((unit, index) => {
    delete unit.garrisonCityId; delete unit.garrisonSlot; delete unit.cityOrder;
    const dx = units.length === 1 ? 0 : (index % columns - (columns - 1) / 2) * 8;
    const dy = units.length === 1 ? 0 : (Math.floor(index / columns) - (Math.ceil(units.length / columns) - 1) / 2) * 8;
    unit.target = city ? { x: city.x, y: city.y } : { x: clamp(point.x + dx, 12, state.width - 12), y: clamp(point.y + dy, 12, state.height - 12) };
    if (city) unit.cityOrder = city.id;
    unit.allowRetreat = true;
  });
  return state;
}

function absorbArrivals(state) {
  if (!state.units.some(unit => unit.cityOrder !== undefined)) return;
  const cities = new Map(state.cities.map(city => [city.id, city])), consumed = new Set(), garrisons = cityGarrisons(state), reports = new Map();
  for (const unit of state.units) {
    if (unit.cityOrder === undefined) continue;
    const city = cities.get(unit.cityOrder);
    if (!city || city.owner !== unit.owner) { delete unit.cityOrder; continue; }
    if (distanceSquared(unit, city) > (city.radius + 8) ** 2) continue;
    if (city.hp < city.maxHp || city.level < city.maxLevel) {
      const report = reports.get(city.id) || { healed: 0, upgraded: 0, beforeLevel: city.level };
      if (city.hp < city.maxHp) { city.hp = Math.min(city.maxHp, round(city.hp + CITY_HEAL_PER_UNIT)); report.healed++; }
      else {
        city.upgradeUnits++; city.radius = round(32 + city.upgradeUnits * 0.3);
        city.level = Math.min(city.maxLevel, city.upgradeUnits >= 40 ? 3 : city.upgradeUnits >= 16 ? 2 : 1);
        city.maxHp = cityHp(state, city.owner, city); city.hp = city.maxHp; report.upgraded++;
      }
      reports.set(city.id, report); consumed.add(unit.id);
    } else {
      delete unit.cityOrder;
      const troops = garrisons.get(city.id), slot = troops.length < cityCapacity(city) ? freeSlot(city, troops) : -1;
      if (slot >= 0) {
        unit.garrisonCityId = city.id; unit.garrisonSlot = slot;
        const point = garrisonPoint(state, city, slot); unit.target = { x: point.x, y: point.y }; troops.push(unit);
      } else {
        // A maxed city never consumes surplus troops; they wait outside its rings.
        const angle = (unit.id * 2.399963229728653), radius = cityRingRadius(city, city.level - 1) + 35;
        unit.target = { x: round(clamp(city.x + Math.cos(angle) * radius, 12, state.width - 12)), y: round(clamp(city.y + Math.sin(angle) * radius, 12, state.height - 12)) };
      }
    }
  }
  if (consumed.size) state.units = state.units.filter(unit => !consumed.has(unit.id));
  for (const [cityId, report] of reports) {
    const city = cities.get(cityId);
    log(state, city.level > report.beforeLevel ? 'upgrade' : report.upgraded ? 'develop' : 'heal', `${city.name}${report.healed ? `吞兵 ${report.healed} 名回血` : ''}${report.healed && report.upgraded ? '，' : ''}${report.upgraded ? `吞兵 ${report.upgraded} 名扩建` : ''}${city.level > report.beforeLevel ? `，升至 ${city.level} 级` : ''}。`, { cityId, playerId: city.owner });
  }
}

const GRID_SIZE = 120;
function balanceOps(state){return {random:()=>random(state),log:(type,text,extra)=>log(state,type,text,extra),reinforce:(owner,count,cityId,options)=>{(state.reinforcements??=[]).push({owner,remaining:count,created:0,cityId,...options});}};}
export function releaseComebackSkill(state,playerId,skillId){
  if(state.status!=='playing')throw Error('本局已经结束。');
  activateComebackSkill(state,playerId,skillId,balanceOps(state));
  arriveReinforcements(state);return state;
}
function arriveReinforcements(state){
  if(!state.reinforcements?.length)return;
  state.reinforcements.sort((a,b)=>Number(Boolean(b.emergency))-Number(Boolean(a.emergency)));
  const counts=Array(state.players.length).fill(0);for(const u of state.units)counts[u.owner]++;
  for(const wave of state.reinforcements){
    if(wave.expiresAt!==undefined&&state.time>=wave.expiresAt){wave.remaining=0;continue;}
    let city=state.cities.find(c=>c.id===wave.cityId&&c.owner===wave.owner)||state.cities.find(c=>c.owner===wave.owner);
    if(!city){wave.remaining=0;continue;}
    for(let i=0;i<(wave.burst||10)&&wave.remaining>0&&state.units.length<MAX_UNITS&&counts[wave.owner]<(wave.ownerLimit||300);i++){
      const type=TYPE_IDS[Math.floor(random(state)*TYPE_IDS.length)],stats=UNIT_TYPES[type],angle=wave.created*2.399963229728653,radius=cityRingRadius(city,(city.level||1)-1)+30+Math.floor(wave.created/24)*12;
      const x=round(clamp(city.x+Math.cos(angle)*radius,12,state.width-12)),y=round(clamp(city.y+Math.sin(angle)*radius,12,state.height-12)),maxHp=stats.maxHp*(hasCard(state,wave.owner,'veteran')?1.2:1);
      const objective=wave.objectives?.[wave.created%wave.objectives.length],destination=state.cities.find(c=>c.id===objective);
      state.units.push({id:state.nextUnitId++,owner:wave.owner,type,glyph:stats.glyph,x,y,hp:maxHp,maxHp,target:destination?{x:destination.x,y:destination.y}:null,attackCooldown:random(state)*.3,facing:round(angle),attacking:false,reinforcement:true,...(wave.uncontrollable?{uncontrollable:true,assaultCityId:objective,expiresAt:wave.expiresAt,speedMultiplier:wave.speedMultiplier}:{})});
      wave.created++;wave.remaining--;counts[wave.owner]++;
    }
  }
  state.reinforcements=state.reinforcements.filter(w=>w.remaining>0);
}
function spatialGrid(units) {
  const grid = [];
  for (const unit of units) {
    const x = Math.floor(unit.x / GRID_SIZE), y = Math.floor(unit.y / GRID_SIZE);
    const column = grid[x] || (grid[x] = []);
    const cell = column[y] || (column[y] = []);
    cell.push(unit);
  }
  return grid;
}
function nearestEnemy(grid, unit, radius) {
  let found = null, best = radius * radius;
  const gx = Math.floor(unit.x / GRID_SIZE), gy = Math.floor(unit.y / GRID_SIZE), span = Math.ceil(radius / GRID_SIZE);
  // Walk the original x/y/unit order directly: no per-soldier candidate array or
  // string-key allocation, and equal-distance enemies still resolve by unit id.
  for (let x = Math.max(0, gx - span), endX = Math.min(grid.length - 1, gx + span); x <= endX; x++) {
    const column = grid[x];
    if (!column) continue;
    for (let y = Math.max(0, gy - span), endY = Math.min(column.length - 1, gy + span); y <= endY; y++) {
      const cell = column[y];
      if (!cell) continue;
      for (let i = 0; i < cell.length; i++) {
        const enemy = cell[i];
        if (enemy.owner === unit.owner || enemy.hp <= 0) continue;
        const dx = unit.x - enemy.x, dxSquared = dx * dx;
        if (dxSquared > best) continue;
        const dy = unit.y - enemy.y, d = dxSquared + dy * dy;
        if (d < best || (d === best && (!found || enemy.id < found.id))) { found = enemy; best = d; }
      }
    }
  }
  return found;
}

function nearestEnemyCity(cities, unit, range) {
  let found = null, best = Infinity;
  for (const city of cities) {
    if (city.owner === unit.owner) continue;
    const d = distanceSquared(city, unit);
    if (d > (city.radius + range) ** 2) continue;
    if (d < best || (d === best && (!found || city.id < found.id))) { found = city; best = d; }
  }
  return found;
}
function terrainSpeed(state, unit) {
  for (const terrain of state.terrain) {
    if (terrain.type === 'ridge' && unit.x >= terrain.x && unit.x <= terrain.x + terrain.width && unit.y >= terrain.y && unit.y <= terrain.y + terrain.height) return 0.55;
    if (terrain.type !== 'river' || terrain.bridges.some(y => Math.abs(unit.y - y) < 35)) continue;
    for (let i = 1; i < terrain.points.length; i++) {
      const [ax, ay] = terrain.points[i - 1], [bx, by] = terrain.points[i];
      if (unit.y >= ay && unit.y <= by && Math.abs(unit.x - (ax + (bx - ax) * (unit.y - ay) / (by - ay))) < terrain.width / 2) return 0.6;
    }
  }
  return 1;
}
function moveToward(state, unit, point, distance) {
  const dx = point.x - unit.x, dy = point.y - unit.y, length = round(Math.hypot(dx, dy));
  if (length <= 0.001) return true;
  const fraction = Math.min(1, distance / length);
  unit.x = round(clamp(unit.x + dx * fraction, 12, state.width - 12));
  unit.y = round(clamp(unit.y + dy * fraction, 12, state.height - 12));
  // Native transcendental functions may differ in their last bits on ARM/x64.
  // Quantize persisted angles just like coordinates for portable snapshots.
  unit.facing = round(Math.atan2(dy, dx));
  return fraction === 1;
}
function attackDamage(state, unit, enemy) {
  let amount = UNIT_TYPES[unit.type].attack * (hasCard(state, unit.owner, 'fierce') ? 1.2 : 1);
  if((state.players[unit.owner]?.battleBuffs?.valorUntil||0)>state.time)amount*=1.6;
  if (enemy.type === 'shield') amount *= unit.type === 'sword' ? 1.2 : unit.type === 'bow' ? 0.55 : 0.8;
  if (unit.type === 'spear' && enemy.type === 'blade') amount *= 1.2;
  return amount;
}

function retreatOrder(unit, opponent) {
  return unit.allowRetreat && unit.target && (unit.target.x - unit.x) * (opponent.x - unit.x) + (unit.target.y - unit.y) * (opponent.y - unit.y) < 0;
}

function simulateTick(state) {
  for (const city of state.cities) normalizeCity(state, city);
  state.tick++;
  state.time = round(state.tick * TICK_SECONDS);
  state.units=state.units.filter(u=>u.expiresAt===undefined||u.expiresAt>state.time);
  const grid = spatialGrid(state.units), unitDamage = new Map(), cityDamage = new Map();
  const addDamage = (id, amount) => unitDamage.set(id, (unitDamage.get(id) || 0) + amount);
  for (const unit of state.units) {
    unit.attackCooldown = round(Math.max(0, unit.attackCooldown - TICK_SECONDS));
    unit.attacking = false;
    const stats = UNIT_TYPES[unit.type], range = stats.range * (unit.type === 'bow' && hasCard(state, unit.owner, 'arrows') ? 1.2 : 1);
    const enemy = nearestEnemy(grid, unit, Math.max(range + 20, 86));
    const buffs=state.players[unit.owner]?.battleBuffs||{};
    const speed = stats.speed * (hasCard(state, unit.owner, 'swift') ? 1.2 : 1) * terrainSpeed(state, unit)*(unit.speedMultiplier||1)*(buffs.speedUntil>state.time?1.35:1)*(unit.slowUntil>state.time?.55:1);
    if(unit.uncontrollable){const goal=state.cities.find(c=>c.id===unit.assaultCityId);if(goal?.owner===unit.owner)unit.target=null;else if(goal)unit.target={x:goal.x,y:goal.y};}
    if (enemy && retreatOrder(unit, enemy)) {
      // A deliberate order away from a threat must allow troops to disengage.
      if (moveToward(state, unit, unit.target, speed * TICK_SECONDS)) unit.target = null;
    } else if (enemy) {
      if (distanceSquared(unit, enemy) > range * range) moveToward(state, unit, enemy, speed * TICK_SECONDS);
      else {
        unit.attacking = true;
        unit.facing = round(Math.atan2(enemy.y - unit.y, enemy.x - unit.x));
        if (unit.attackCooldown <= 0) { addDamage(enemy.id, attackDamage(state, unit, enemy)); unit.attackCooldown = stats.cooldown; }
      }
    } else {
      const city = nearestEnemyCity(state.cities, unit, range);
      if (city && retreatOrder(unit, city)) {
        if (moveToward(state, unit, unit.target, speed * TICK_SECONDS)) unit.target = null;
      } else if (city) {
        unit.attacking = true;
        if (unit.attackCooldown <= 0) {
          if (!cityDamage.has(city.id)) cityDamage.set(city.id, new Map());
          const damage = cityDamage.get(city.id);
          const amount = stats.attack * (hasCard(state, unit.owner, 'fierce') ? 1.2 : 1) * (hasCard(state, unit.owner, 'siege') ? 1.35 : 1)*(buffs.valorUntil>state.time?1.6:1)*(city.owner===-1&&buffs.firstStrikeUntil>state.time?2:1);
          damage.set(unit.owner, (damage.get(unit.owner) || 0) + amount);
          unit.attackCooldown = stats.cooldown;
        }
      } else {
        const home = state.cities.find(c => c.id === unit.garrisonCityId && c.owner === unit.owner);
        if (home && Number.isInteger(unit.garrisonSlot) && unit.cityOrder === undefined) {
          const point = garrisonPoint(state, home, unit.garrisonSlot);
          // Patrol is a formation movement: terrain/type speed differences must
          // not bunch the rings together. Field marches still use troop speed.
          const patrolSpeed = Math.max(speed, cityRingRadius(home, (home.level || 1) - 1) * 0.28 + 12);
          if (moveToward(state, unit, point, patrolSpeed * TICK_SECONDS)) unit.target = null;
        } else if (unit.target && moveToward(state, unit, unit.target, speed * TICK_SECONDS)) unit.target = null;
      }
    }
    if (hasCard(state, unit.owner, 'renewal') && state.cities.some(city => city.owner === unit.owner && distanceSquared(city, unit) < 110 ** 2)) unit.hp = Math.min(unit.maxHp, round(unit.hp + TICK_SECONDS * 2));
  }
  // Every attack is calculated before casualties or ownership changes are applied.
  for (const city of state.cities) {
    city.attackCooldown = round(Math.max(0, city.attackCooldown - TICK_SECONDS));
    if (city.owner < 0 || city.attackCooldown > 0) continue;
    const enemy = nearestEnemy(grid, city, 103);
    if (enemy) { addDamage(enemy.id, 6 * (hasCard(state, city.owner, 'bastion') ? 1.25 : 1)); city.attackCooldown = 0.7; }
  }
  for (const unit of state.units) unit.hp = round(unit.hp - (unitDamage.get(unit.id) || 0));
  state.units = state.units.filter(unit => unit.hp > 0);
  for (const city of state.cities) {
    const attackers = cityDamage.get(city.id);
    if (attackers) {
      const protection=state.players[city.owner]?.battleBuffs?.wallsUntil>state.time?.4:1;
      city.hp = round(city.hp - [...attackers.values()].reduce((sum, amount) => sum + amount, 0)*protection);
      if (city.hp <= 0) {
        // A mutual last blow cannot resurrect an army that died in the same tick.
        const contenders = [...attackers].filter(([owner]) => state.units.some(unit => unit.owner === owner)).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
        const owner = contenders[0]?.[0] ?? -1, previousOwner = city.owner;
        if(previousOwner>=0)normalizeBalance(state.players[previousOwner]).losses.push(state.time);
        city.owner = owner; city.country = owner >= 0 ? COUNTRIES[owner] : '城'; city.maxHp = cityHp(state, owner, city); city.hp = city.maxHp; city.spawnProgress = 0; city.attackCooldown = 0.7;
        city.readyAt=owner>=0?state.time+CAPTURE_RECOVERY_SECONDS:0;
        log(state, 'capture', `${owner === -1 ? '守军溃散，' : state.players[owner].name + '夺取'}${city.name}${owner === -1 ? '成为空城' : ''}。`, { cityId: city.id, playerId: owner, previousOwner });
      }
    } else if (city.owner >= 0) city.hp = Math.min(city.maxHp, round(city.hp + 0.35));
  }
  absorbArrivals(state);
  const ownerCounts = Array(state.players.length).fill(0), garrisons = cityGarrisons(state);
  for (const city of state.cities) for (const unit of garrisons.get(city.id)) {
    if (unit.target || (unit.garrisonCityId === city.id && Number.isInteger(unit.garrisonSlot))) continue;
    const slot = freeSlot(city, garrisons.get(city.id));
    if (slot >= 0) { unit.garrisonCityId = city.id; unit.garrisonSlot = slot; }
  }
  for (const unit of state.units) ownerCounts[unit.owner]++;
  const readyCounts=Array(state.players.length).fill(0);
  for(const city of state.cities)if(city.owner>=0&&(city.readyAt||0)<=state.time)readyCounts[city.owner]++;
  for (const city of state.cities) {
    if (city.owner < 0 || (city.readyAt||0)>state.time) continue;
    const interval = hasCard(state, city.owner, 'levy') ? 1.7 / 1.25 : 1.7;
    const multiplier=productionPower(readyCounts[city.owner])/readyCounts[city.owner]*(state.players[city.owner].battleBuffs?.musterUntil>state.time?1.5:1);
    city.spawnProgress = round(city.spawnProgress + TICK_SECONDS / interval*multiplier);
    if (city.spawnProgress >= 1) {
      if (spawnUnit(state, city, ownerCounts, garrisons.get(city.id))) city.spawnProgress = round(city.spawnProgress - 1);
      else city.spawnProgress = 1;
    }
  }
  updateComebacks(state,balanceOps(state));arriveReinforcements(state);
  checkVictory(state);
}

function checkVictory(state) {
  const cityOwners = new Set(state.cities.map(city => city.owner));
  for (const player of state.players) {
    const alive = cityOwners.has(player.id);
    if (player.alive && !alive) log(state, 'eliminated', `${player.name}失去所有城池，已战败。`, { playerId: player.id });
    player.alive = alive;
  }
  // Losing the last city is defeat even when field troops survived this tick.
  state.units = state.units.filter(unit => state.players[unit.owner]?.alive);
  const alive = state.players.filter(player => player.alive);
  if (alive.length > 1) return;
  state.status = 'finished'; state.winner = alive[0]?.id ?? null;
  // The sole remaining faction receives the peaceful surrender of neutral towns.
  if (alive.length === 1) for (const city of state.cities) if (city.owner === -1) {
    city.owner = state.winner; city.country = COUNTRIES[state.winner]; city.maxHp = cityHp(state, state.winner, city); city.hp = city.maxHp; city.spawnProgress = 0;
  }
  log(state, 'victory', alive.length ? `${alive[0].name}统一山河！` : '双方同归于尽，本局平局。', { playerId: state.winner });
}

export function stepGame(state, dt = TICK_SECONDS) {
  if (!Number.isFinite(dt) || dt < 0 || dt > 2) throw Error('时间步必须为 0–2 秒。');
  if (state.status !== 'playing' || dt === 0) return state;
  state.stepRemainder = round(state.stepRemainder + dt);
  while (state.stepRemainder + 1e-9 >= TICK_SECONDS && state.status === 'playing') {
    state.stepRemainder = round(Math.max(0, state.stepRemainder - TICK_SECONDS));
    simulateTick(state);
  }
  return state;
}

export function surrenderPlayer(state, playerId) {
  if (state.status !== 'playing' || !Number.isInteger(playerId) || !state.players[playerId]?.alive) throw Error('阵营无法投降。');
  state.units = state.units.filter(unit => unit.owner !== playerId);
  for (const city of state.cities) if (city.owner === playerId) {
    normalizeCity(state, city); city.owner = -1; city.country = '城'; city.maxHp = cityHp(state, -1, city); city.hp = city.maxHp; city.spawnProgress = 0;
  }
  state.players[playerId].alive = false;
  log(state, 'surrender', `${state.players[playerId].name}收兵离场。`, { playerId });
  checkVictory(state);
  return state;
}

export function aiCommand(state, playerId) {
  if (state.status !== 'playing' || !state.players[playerId]?.alive) return state;
  const army = state.units.filter(unit => unit.owner === playerId&&!unit.uncontrollable), homes = state.cities.filter(city => city.owner === playerId);
  if (!army.length) return state;
  const order = (units, destination) => {
    commandUnits(state, playerId, units.map(unit => unit.id), destination);
    // AI attack orders engage intervening defenders instead of repeatedly kiting.
    for (const unit of units) unit.allowRetreat = false;
  };
  const profile = AI_DIFFICULTIES.find(d=>d.id===state.aiDifficulty);
  if (profile && profile.id !== 'hard') {
    const player = state.players[playerId];
    if (state.time < profile.opening || state.time - (player.aiLastOrder ?? -1000) < profile.interval) return state;
    const danger = homes.map(city=>({city,enemies:state.units.filter(u=>u.owner!==playerId&&distanceSquared(city,u)<170**2).length})).filter(x=>x.enemies>=5).sort((a,b)=>b.enemies-a.enemies||a.city.id-b.city.id)[0];
    if (danger) { order(army,danger.city); player.aiLastOrder=state.time; return state; }
    // Keep marching groups on their existing orders. New garrison troops form
    // a separate expedition, allowing human players time to read each attack.
    const idle = army.filter(u=>!u.target);
    const reserve = Math.ceil(idle.length * profile.reserve), expedition = idle.slice(reserve);
    if (expedition.length < profile.minArmy) return state;
    const center={x:expedition.reduce((sum,u)=>sum+u.x,0)/expedition.length,y:expedition.reduce((sum,u)=>sum+u.y,0)/expedition.length};
    const enemies=state.cities.filter(c=>c.owner!==playerId);
    const target=enemies.map(city=>({city,score:Math.sqrt(distanceSquared(center,city))+(city.owner<0?-100:100)+state.units.filter(u=>u.owner===city.owner&&distanceSquared(city,u)<145**2).length*8})).sort((a,b)=>a.score-b.score||a.city.id-b.city.id)[0]?.city;
    if (target) { order(expedition,target);player.aiLastOrder=state.time; }
    return state;
  }
  const enemies = state.cities.filter(city => city.owner !== playerId);
  const threatened = homes.map(city => ({ city, danger: state.units.filter(unit => unit.owner !== playerId && distanceSquared(city, unit) < 190 ** 2).length })).filter(item => item.danger >= 5).sort((a, b) => b.danger - a.danger || a.city.id - b.city.id);
  if (threatened.length) {
    order(army, threatened[0].city);
    return state;
  }
  const center = { x: army.reduce((sum, unit) => sum + unit.x, 0) / army.length, y: army.reduce((sum, unit) => sum + unit.y, 0) / army.length };
  const destination = enemies.map(city => ({ city, score: Math.sqrt(distanceSquared(center, city)) + (city.owner === -1 ? -70 : 65) + state.units.filter(unit => unit.owner === city.owner && distanceSquared(city, unit) < 145 ** 2).length * 6 })).sort((a, b) => a.score - b.score || a.city.id - b.city.id)[0]?.city;
  if (destination) {
    // Leave a small home garrison when there are enough troops for a field army.
    const reserve = homes.length && army.length > 22 ? Math.min(5, army.length - 16) : 0;
    order(army.slice(reserve), destination);
  } else {
    const opponent = state.units.filter(unit => unit.owner !== playerId).sort((a, b) => distanceSquared(center, a) - distanceSquared(center, b) || a.id - b.id)[0];
    if (opponent) order(army, opponent);
  }
  return state;
}

export function summarize(state) {
  return state.players.map(player => ({ ...player, units: state.units.filter(unit => unit.owner === player.id).length,
    cities: state.cities.filter(city => city.owner === player.id).length,
    hp: Math.round(state.units.filter(unit => unit.owner === player.id).reduce((sum, unit) => sum + unit.hp, 0)) }));
}
