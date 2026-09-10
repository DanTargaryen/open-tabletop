export const SPELLS = Object.freeze([
  { id: 1, name: '远古巨龙', icon: '龙', copies: 1, tag: '群体重击', description: '投掷特殊骰（1/1/1/2/2/3），其他所有玩家失去等同点数的生命；施放失败时，自己失去骰子点数再加 1 点生命。' },
  { id: 2, name: '暗夜行者', icon: '影', copies: 2, tag: '群伤吸取', description: '其他所有玩家失去 1 点生命，你恢复 1 点生命。' },
  { id: 3, name: '甜美梦境', icon: '梦', copies: 3, tag: '强力治疗', description: '投掷特殊骰（1/1/1/2/2/3），恢复等同点数的生命，最多恢复到 6。' },
  { id: 4, name: '夜之歌者', icon: '月', copies: 4, tag: '秘密奖励', description: '取得并查看一枚秘密石；存活到本轮结束时额外获得 1 分。' },
  { id: 5, name: '闪电风暴', icon: '雷', copies: 5, tag: '相邻攻击', description: '左右相邻玩家各失去 1 点生命；两人局只造成 1 点伤害。' },
  { id: 6, name: '凛冬暴雪', icon: '雪', copies: 6, tag: '攻击左侧', description: '左侧玩家失去 1 点生命。' },
  { id: 7, name: '炽热火球', icon: '火', copies: 7, tag: '攻击右侧', description: '右侧玩家失去 1 点生命。' },
  { id: 8, name: '魔力药水', icon: '药', copies: 8, tag: '稳定治疗', description: '恢复 1 点生命，最多恢复到 6。' },
]);

export const AI_PROFILES = Object.freeze([
  { name: '星辉', title: '谨慎演算', color: '#8bd9d2', risk: .28, continueBias: .3, attack: .85 },
  { name: '赤焰', title: '激进连咏', color: '#ff8a68', risk: .72, continueBias: .74, attack: 1.18 },
  { name: '月桂', title: '均衡推理', color: '#c8a8ff', risk: .5, continueBias: .52, attack: 1 },
  { name: '鸦羽', title: '伺机收割', color: '#efc76f', risk: .58, continueBias: .6, attack: 1.32 },
]);

export const MAGIC_DIE_FACES = Object.freeze([1, 1, 1, 2, 2, 3]);

const MODES = new Set(['score', 'single']);
const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function hashSeed(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function randomSeed() {
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  return `${Date.now()}-${Math.random()}`;
}

function randomStep(state) {
  let value = state >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0 || 1;
}

function spellById(id) {
  return SPELLS[id - 1];
}

export class AbracadaGame {
  constructor({ playerCount = 4, mode = 'score', playerName = '你', seed } = {}) {
    if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 5) throw new Error('玩家人数必须是 2–5。');
    if (!MODES.has(mode)) throw new Error('未知游戏模式。');
    const actualSeed = seed ?? randomSeed();
    this._s = {
      schemaVersion: 1,
      mode,
      playerCount,
      seed: String(actualSeed),
      rng: hashSeed(actualSeed),
      phase: 'ready',
      round: 0,
      activeIndex: 0,
      nextStarter: 0,
      lastSuccessfulSpell: null,
      turnCastCount: 0,
      die: null,
      drawPile: [],
      secretPool: [],
      publicRemoved: [],
      castStones: [],
      eventId: 0,
      events: [],
      roundResult: null,
      gameWinnerIds: [],
      players: Array.from({ length: playerCount }, (_, id) => {
        const profile = AI_PROFILES[(id - 1 + AI_PROFILES.length) % AI_PROFILES.length];
        return {
          id,
          name: id === 0 ? String(playerName).trim().slice(0, 20) || '你' : profile.name,
          title: id === 0 ? '见习魔法师' : profile.title,
          color: id === 0 ? '#f5e4ad' : profile.color,
          isHuman: id === 0,
          aiProfile: id === 0 ? null : clone(profile),
          life: 6,
          score: 0,
          rack: [],
          secrets: [],
          ruledOutSpells: [],
        };
      }),
    };
  }

  _random() {
    this._s.rng = randomStep(this._s.rng);
    return this._s.rng / 4294967296;
  }

  _shuffle(values) {
    for (let index = values.length - 1; index > 0; index--) {
      const selected = Math.floor(this._random() * (index + 1));
      [values[index], values[selected]] = [values[selected], values[index]];
    }
    return values;
  }

  _roll() {
    const value = MAGIC_DIE_FACES[Math.floor(this._random() * MAGIC_DIE_FACES.length)];
    this._s.die = value;
    return value;
  }

  _log(text, type = 'info', playerId = null, spell = null) {
    const event = { id: ++this._s.eventId, round: this._s.round, text, type };
    if (playerId !== null) event.playerId = playerId;
    if (spell !== null) event.spell = spell;
    this._s.events.push(event);
    if (this._s.events.length > 120) this._s.events.shift();
  }

  startGame() {
    if (this._s.phase !== 'ready') throw new Error('游戏已经开始。');
    for (const player of this._s.players) player.score = 0;
    this._s.nextStarter = 0;
    this._startRound();
    return this.getPublicState();
  }

  _startRound() {
    const s = this._s;
    const stones = [];
    for (const spell of SPELLS) for (let count = 0; count < spell.copies; count++) stones.push(spell.id);
    this._shuffle(stones);
    for (const player of s.players) {
      player.life = 6;
      player.rack = stones.splice(0, 5);
      player.secrets = [];
      player.ruledOutSpells = [];
    }
    const removedCount = s.playerCount === 2 ? 12 : s.playerCount === 3 ? 6 : 0;
    s.publicRemoved = stones.splice(0, removedCount);
    s.secretPool = stones.splice(0, 4);
    s.drawPile = stones;
    s.castStones = [];
    s.round++;
    s.activeIndex = s.nextStarter;
    s.lastSuccessfulSpell = null;
    s.turnCastCount = 0;
    s.die = null;
    s.roundResult = null;
    s.gameWinnerIds = [];
    s.phase = 'casting';
    this._log(`第 ${s.round} 轮开始，${s.players[s.activeIndex].name} 先手。`, 'round');
  }

  nextRound() {
    if (this._s.mode !== 'score' || this._s.phase !== 'round-complete') throw new Error('当前不能开始下一轮。');
    this._startRound();
    return this.getPublicState();
  }

  _heal(player, amount) {
    const healed = Math.min(6 - player.life, amount);
    player.life += healed;
    return healed;
  }

  _damage(player, amount) {
    const lost = Math.min(player.life, amount);
    player.life -= lost;
    return lost;
  }

  _leftOf(index) {
    return (index + 1) % this._s.playerCount;
  }

  _rightOf(index) {
    return (index - 1 + this._s.playerCount) % this._s.playerCount;
  }

  _resolveSpell(id, actor) {
    const s = this._s;
    const others = s.players.filter(player => player.id !== actor.id);
    let roll = null;
    if (id === 1) {
      const amount = this._roll();
      roll = amount;
      for (const player of others) this._damage(player, amount);
      this._log(`巨龙掷出 ${amount}，其他玩家各失去 ${amount} 点生命。`, 'effect', actor.id, id);
    }
    if (id === 2) {
      for (const player of others) this._damage(player, 1);
      const healed = this._heal(actor, 1);
      this._log(`暗影掠过全场，其他玩家各失去 1 点生命；${actor.name}${healed ? '恢复 1 点' : '生命已满'}。`, 'effect', actor.id, id);
    }
    if (id === 3) {
      const amount = this._roll();
      roll = amount;
      const healed = this._heal(actor, amount);
      this._log(`${actor.name} 掷出 ${amount}，实际恢复 ${healed} 点生命。`, 'effect', actor.id, id);
    }
    if (id === 4) {
      if (s.secretPool.length) {
        const secret = s.secretPool.shift();
        actor.secrets.push(secret);
        this._log(`${actor.name} 收下一枚秘密石。`, 'secret', actor.id, id);
      } else {
        this._log('秘密石已经全部被取走。', 'effect', actor.id, id);
      }
    }
    if (id === 5) {
      const left = s.players[this._leftOf(actor.id)];
      const right = s.players[this._rightOf(actor.id)];
      this._damage(left, 1);
      if (right.id !== left.id) this._damage(right, 1);
      this._log(s.playerCount === 2 ? `${left.name} 失去 1 点生命。` : `${left.name} 与 ${right.name} 各失去 1 点生命。`, 'effect', actor.id, id);
    }
    if (id === 6) {
      const target = s.players[this._leftOf(actor.id)];
      this._damage(target, 1);
      this._log(`${target.name} 被暴雪击中，失去 1 点生命。`, 'effect', actor.id, id);
    }
    if (id === 7) {
      const target = s.players[this._rightOf(actor.id)];
      this._damage(target, 1);
      this._log(`${target.name} 被火球击中，失去 1 点生命。`, 'effect', actor.id, id);
    }
    if (id === 8) {
      const healed = this._heal(actor, 1);
      this._log(healed ? `${actor.name} 恢复 1 点生命。` : `${actor.name} 生命已满，药水没有额外效果。`, 'effect', actor.id, id);
    }
    return roll === null ? {} : { roll };
  }

  cast(spellId) {
    const s = this._s;
    if (s.phase !== 'casting') throw new Error('当前不能施法。');
    if (!Number.isInteger(spellId) || spellId < 1 || spellId > 8) throw new Error('请选择 1–8 号法术。');
    const actor = s.players[s.activeIndex];
    if (s.lastSuccessfulSpell !== null && spellId < s.lastSuccessfulSpell) {
      const lost = this._damage(actor, 1);
      this._log(`${actor.name} 试图从 ${s.lastSuccessfulSpell} 号降到 ${spellId} 号，咒语逆流并失去 1 点生命。`, 'fail', actor.id, spellId);
      if (actor.life === 0) this._finishRound({ kind: 'self-fail', loserIds: [actor.id] });
      else this._endTurn();
      return { success: false, illegal: true, spell: spellId, damage: lost, lifeChanges: [{ playerId: actor.id, amount: -lost }] };
    }
    this._log(`${actor.name} 宣告 ${spellId} 号「${spellById(spellId).name}」。`, 'cast', actor.id, spellId);
    const matchingIndex = actor.rack.indexOf(spellId);
    if (matchingIndex < 0) {
      actor.ruledOutSpells ??= [];
      if (!actor.ruledOutSpells.includes(spellId)) actor.ruledOutSpells.push(spellId);
      const roll = spellId === 1 ? this._roll() : null;
      const amount = 1 + (roll ?? 0);
      const lost = this._damage(actor, amount);
      const failureText = roll===null?`失去 ${lost} 点生命`:`骰子惩罚 ${roll} 点，加上常规失败 1 点，实际失去 ${lost} 点生命`;
      this._log(`${actor.name} 施法失败，${failureText}。`, 'fail', actor.id, spellId);
      if (actor.life === 0) this._finishRound({ kind: 'self-fail', loserIds: [actor.id] });
      else this._endTurn();
      return { success: false, spell: spellId, damage: lost, roll, lifeChanges: [{ playerId: actor.id, amount: -lost }] };
    }
    actor.rack.splice(matchingIndex, 1);
    s.castStones.push(spellId);
    s.lastSuccessfulSpell = spellId;
    s.turnCastCount++;
    this._log(`施法成功：${spellById(spellId).name}。`, 'success', actor.id, spellId);
    const lifeBefore = s.players.map(player => player.life);
    const effect = this._resolveSpell(spellId, actor);
    const lifeChanges = s.players.flatMap((player, index) => player.life === lifeBefore[index] ? [] : [{ playerId: player.id, amount: player.life - lifeBefore[index] }]);
    const defeated = s.players.filter(player => player.life === 0).map(player => player.id);
    if (actor.rack.length === 0) this._finishRound({ kind: 'empty-rack', winnerIds: [actor.id], loserIds: s.players.filter(player => player.id !== actor.id).map(player => player.id) });
    else if (defeated.length) this._finishRound({ kind: 'attack', winnerIds: [actor.id], loserIds: defeated });
    return { success: true, spell: spellId, ...effect, lifeChanges };
  }

  stop() {
    const s = this._s;
    if (s.phase !== 'casting' || s.turnCastCount < 1) throw new Error('至少成功施放一次后才能收手。');
    const actor = s.players[s.activeIndex];
    this._log(`${actor.name} 结束连咏。`, 'stop', actor.id);
    this._endTurn();
    return this.getPublicState();
  }

  _endTurn() {
    const s = this._s;
    const actor = s.players[s.activeIndex];
    const needed = Math.min(5 - actor.rack.length, s.drawPile.length);
    if (needed > 0) {
      actor.rack.push(...s.drawPile.splice(0, needed));
      actor.ruledOutSpells = [];
    }
    s.activeIndex = this._leftOf(s.activeIndex);
    s.lastSuccessfulSpell = null;
    s.turnCastCount = 0;
    s.die = null;
    this._log(`轮到 ${s.players[s.activeIndex].name}。`, 'turn', s.activeIndex);
  }

  _finishRound({ kind, winnerIds = [], loserIds = [] }) {
    const s = this._s;
    if (kind === 'empty-rack') for (const player of s.players) if (!winnerIds.includes(player.id)) player.life = 0;
    const survivors = s.players.filter(player => player.life > 0).map(player => player.id);
    const basePoints = Array(s.playerCount).fill(0);
    if (s.mode === 'score') {
      if (kind === 'empty-rack' || kind === 'attack') for (const winnerId of winnerIds) basePoints[winnerId] += 3;
      if (kind === 'attack') for (const playerId of survivors) if (!winnerIds.includes(playerId)) basePoints[playerId] += 1;
      if (kind === 'self-fail') for (const playerId of survivors) basePoints[playerId] += 1;
      for (const playerId of survivors) basePoints[playerId] += s.players[playerId].secrets.length;
      for (const player of s.players) player.score += basePoints[player.id];
    }
    const singleWinners = winnerIds.length ? winnerIds : kind === 'self-fail' ? survivors : [];
    const summary = kind === 'empty-rack'
      ? `${s.players[winnerIds[0]].name} 清空法术石，赢得本轮。`
      : kind === 'attack'
        ? `${s.players[winnerIds[0]].name} 完成最后一击，赢得本轮。`
        : `${s.players[loserIds[0]].name} 因施法失误耗尽生命。`;
    s.roundResult = { kind, winnerIds, loserIds, survivors, points: basePoints, summary, life: s.players.map(player => player.life) };
    s.nextStarter = this._leftOf(s.activeIndex);
    this._log(summary, 'round-end');
    if (s.mode === 'single') {
      s.gameWinnerIds = singleWinners;
      s.phase = 'game-complete';
      return;
    }
    const candidates = s.players.filter(player => player.score >= 8);
    if (!candidates.length) {
      s.phase = 'round-complete';
      return;
    }
    const bestRoundScore = Math.max(...candidates.map(player => basePoints[player.id]));
    let finalists = candidates.filter(player => basePoints[player.id] === bestRoundScore);
    const bestLife = Math.max(...finalists.map(player => player.life));
    finalists = finalists.filter(player => player.life === bestLife);
    s.gameWinnerIds = finalists.map(player => player.id);
    s.phase = 'game-complete';
  }

  _unknownCountsFor(playerId) {
    const counts = Object.fromEntries(SPELLS.map(spell => [spell.id, spell.copies]));
    const observer = this._s.players[playerId];
    const known = [
      ...this._s.publicRemoved,
      ...this._s.castStones,
      ...observer.secrets,
      ...this._s.players.filter(player => player.id !== playerId).flatMap(player => player.rack),
    ];
    for (const spell of known) counts[spell]--;
    return counts;
  }

  spellProbabilityFor(playerId, spellId) {
    const player = this._s.players[playerId];
    if (!player || !Number.isInteger(spellId) || spellId < 1 || spellId > 8) throw new Error('无法计算该法术。');
    const counts = this._unknownCountsFor(playerId);
    const unknownTotal = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const available = counts[spellId];
    const rackSize = player.rack.length;
    if (available <= 0 || rackSize <= 0) return 0;
    if (unknownTotal - available < rackSize) return 1;
    let miss = 1;
    for (let index = 0; index < rackSize; index++) miss *= (unknownTotal - available - index) / (unknownTotal - index);
    return clamp(1 - miss, 0, 1);
  }

  _spellValue(id, actor) {
    const s = this._s;
    const profile = actor.aiProfile;
    const others = s.players.filter(player => player.id !== actor.id);
    const kill = target => target.life <= (id === 1 ? 3.5 : 1) ? 2.6 * profile.attack : 0;
    if (id === 1) return others.reduce((sum, target) => sum + Math.min(3.5, target.life) + kill(target), 0);
    if (id === 2) return others.reduce((sum, target) => sum + 1 + kill(target), 0) + (actor.life < 6 ? .8 : 0);
    if (id === 3) return Math.min(3.5, 6 - actor.life) * .85;
    if (id === 4) return s.secretPool.length ? (s.mode === 'score' ? 2.2 : .45) : 0;
    if (id === 5) {
      const targets = [...new Set([this._leftOf(actor.id), this._rightOf(actor.id)])].map(index => s.players[index]);
      return targets.reduce((sum, target) => sum + 1 + kill(target), 0);
    }
    if (id === 6) {
      const target = s.players[this._leftOf(actor.id)];
      return 1 + kill(target);
    }
    if (id === 7) {
      const target = s.players[this._rightOf(actor.id)];
      return 1 + kill(target);
    }
    return actor.life < 6 ? .75 : .08;
  }

  _rankBotSpells(actor) {
    const minimum = this._s.lastSuccessfulSpell ?? 1;
    const ruledOut = new Set(actor.ruledOutSpells ?? []);
    return SPELLS.filter(spell => spell.id >= minimum && !ruledOut.has(spell.id)).map(spell => {
      const probability = this.spellProbabilityFor(actor.id, spell.id);
      const failureCost = spell.id === 1 ? Math.min(3.5, actor.life) : 1;
      const safety = actor.life <= 2 ? 1.7 : 1;
      const expected = probability * this._spellValue(spell.id, actor) - (1 - probability) * failureCost * safety;
      const preference = (actor.aiProfile.risk - .5) * (9 - spell.id) * .08 + (this._random() - .5) * .08;
      return { spell: spell.id, probability, score: expected + preference };
    }).sort((left, right) => right.score - left.score || right.probability - left.probability || right.spell - left.spell);
  }

  botAction() {
    const s = this._s;
    if (s.phase !== 'casting') throw new Error('当前没有 AI 行动。');
    const actor = s.players[s.activeIndex];
    if (actor.isHuman) throw new Error('当前应由玩家行动。');
    const best = this._rankBotSpells(actor)[0];
    if (s.turnCastCount > 0) {
      const caution = actor.life <= 2 ? .2 : 0;
      const threshold = .18 + (1 - actor.aiProfile.risk) * .22 + caution;
      const continueChance = actor.aiProfile.continueBias + Math.max(-.2, Math.min(.2, best.score * .08));
      if (best.probability < threshold || this._random() > continueChance) {
        this.stop();
        return { type: 'stop', playerId: actor.id };
      }
    }
    const result = this.cast(best.spell);
    return { type: 'cast', playerId: actor.id, ...result, probability: best.probability };
  }

  getPublicState(viewerId = 0) {
    const s = this._s;
    const viewer = s.players[viewerId];
    if (!viewer) throw new Error('未知玩家。');
    return {
      schemaVersion: s.schemaVersion,
      mode: s.mode,
      playerCount: s.playerCount,
      phase: s.phase,
      round: s.round,
      activeIndex: s.activeIndex,
      nextStarter: s.nextStarter,
      lastSuccessfulSpell: s.lastSuccessfulSpell,
      turnCastCount: s.turnCastCount,
      die: s.die,
      drawPileCount: s.drawPile.length,
      secretPoolCount: s.secretPool.length,
      publicRemoved: [...s.publicRemoved],
      castStones: [...s.castStones],
      events: clone(s.events),
      roundResult: clone(s.roundResult),
      gameWinnerIds: [...s.gameWinnerIds],
      canStop: s.phase === 'casting' && s.activeIndex === viewerId && s.turnCastCount > 0,
      minimumSpell: s.lastSuccessfulSpell ?? 1,
      players: s.players.map(player => ({
        id: player.id,
        name: player.name,
        title: player.title,
        color: player.color,
        isHuman: player.isHuman,
        life: player.life,
        score: player.score,
        rack: player.id === viewerId ? player.rack.map(() => null) : [...player.rack],
        secrets: player.id === viewerId ? [...player.secrets] : player.secrets.map(() => null),
      })),
    };
  }
}
