import test from 'node:test';
import assert from 'node:assert/strict';
import {AbracadaGame,AI_PROFILES,MAGIC_DIE_FACES,SPELLS} from '../web/engine.js';

function started(options={}) {
  const game=new AbracadaGame({seed:'test-seed',...options});
  game.startGame();
  return game;
}

function allStones(state) {
  return [
    ...state.drawPile,
    ...state.secretPool,
    ...state.publicRemoved,
    ...state.castStones,
    ...state.players.flatMap(player=>[...player.rack,...player.secrets]),
  ];
}

test('spell supply contains exactly 36 stones',()=>{
  assert.equal(SPELLS.reduce((sum,spell)=>sum+spell.copies,0),36);
  for(const spell of SPELLS)assert.equal(spell.id,spell.copies);
});

test('magic die has three ones, two twos, and one three',()=>{
  assert.deepEqual([...MAGIC_DIE_FACES],[1,1,1,2,2,3]);
  assert.equal(Object.isFrozen(MAGIC_DIE_FACES),true);
  const game=started();
  const rolls=Array.from({length:200},()=>game._roll());
  assert.ok(rolls.every(value=>[1,2,3].includes(value)));
  assert.deepEqual([...new Set(rolls)].sort(),[1,2,3]);
});

test('setup supports two to five seats and fills bots',()=>{
  for(const playerCount of [2,3,4,5]){
    const game=started({playerCount});
    const state=game._s;
    assert.equal(state.players.length,playerCount);
    assert.equal(state.players.filter(player=>player.isHuman).length,1);
    assert.equal(state.players.filter(player=>!player.isHuman).length,playerCount-1);
    assert.ok(state.players.every(player=>player.rack.length===5&&player.life===6));
    assert.equal(state.publicRemoved.length,playerCount===2?12:playerCount===3?6:0);
    assert.equal(state.secretPool.length,4);
    const stones=allStones(state);
    assert.equal(stones.length,36);
    for(const spell of SPELLS)assert.equal(stones.filter(value=>value===spell.id).length,spell.copies);
  }
});

test('public state hides only the viewer rack and opponents secrets',()=>{
  const game=started({playerCount:3});
  game._s.players[0].rack=[1,2,3];
  game._s.players[0].secrets=[4];
  game._s.players[1].rack=[5,6,7];
  game._s.players[1].secrets=[8];
  const view=game.getPublicState(0);
  assert.deepEqual(view.players[0].rack,[null,null,null]);
  assert.deepEqual(view.players[0].secrets,[4]);
  assert.deepEqual(view.players[1].rack,[5,6,7]);
  assert.deepEqual(view.players[1].secrets,[null]);
});

test('additional spells must have an equal or higher number',()=>{
  const game=started({playerCount:2});
  game._s.players[0].rack=[5,4,8];
  game._s.players[0].life=6;
  assert.equal(game.cast(5).success,true);
  const result=game.cast(4);
  assert.equal(result.illegal,true);
  assert.equal(game._s.players[0].life,5);
  assert.equal(game._s.activeIndex,1);
  assert.deepEqual(game._s.players[0].rack.includes(4),true);
});

test('two-player lightning damages the opponent only once',()=>{
  const game=started({playerCount:2});
  game._s.players[0].rack=[5,8];
  game._s.players[1].life=6;
  game.cast(5);
  assert.equal(game._s.players[1].life,5);
});

test('a successful dragon deals exactly the rolled damage without failure damage',()=>{
  const game=started({playerCount:3});
  game._s.players[0].rack=[1,8];
  game._roll=()=>{game._s.die=2;return 2;};
  const result=game.cast(1);
  assert.equal(result.success,true);
  assert.equal(result.roll,2);
  assert.deepEqual(game._s.players.map(player=>player.life),[6,4,4]);
  assert.deepEqual(result.lifeChanges,[{playerId:1,amount:-2},{playerId:2,amount:-2}]);
});

test('all healing, directional, group, and secret spell effects resolve',()=>{
  const dragon=started({playerCount:3});
  dragon._s.players[0].rack=[1,8];
  dragon.cast(1);
  assert.equal(dragon._s.players[1].life,dragon._s.players[2].life);
  assert.ok(dragon._s.players[1].life>=0&&dragon._s.players[1].life<=5);

  const wanderer=started({playerCount:3});
  wanderer._s.players[0].rack=[2,8];
  wanderer._s.players[0].life=4;
  wanderer.cast(2);
  assert.deepEqual(wanderer._s.players.map(player=>player.life),[5,5,5]);

  const dream=started({playerCount:3});
  dream._s.players[0].rack=[3,8];
  dream._s.players[0].life=1;
  dream.cast(3);
  assert.ok(dream._s.players[0].life>=2&&dream._s.players[0].life<=6);

  const singer=started({playerCount:3});
  singer._s.players[0].rack=[4,8];
  const secret=singer._s.secretPool[0];
  singer.cast(4);
  assert.equal(singer._s.players[0].secrets[0],secret);
  assert.equal(singer._s.secretPool.length,3);

  const directional=started({playerCount:3});
  directional._s.players[0].rack=[6,7,8,8];
  directional.cast(6);
  assert.deepEqual(directional._s.players.map(player=>player.life),[6,5,6]);
  directional.cast(7);
  assert.deepEqual(directional._s.players.map(player=>player.life),[6,5,5]);
  directional._s.players[0].life=5;
  directional.cast(8);
  assert.equal(directional._s.players[0].life,6);
});

test('a failed dragon adds normal failure damage after the penalty roll',()=>{
  const game=started({playerCount:3});
  game._s.players[0].rack=[8,8,7];
  game._roll=()=>{game._s.die=3;return 3;};
  const result=game.cast(1);
  assert.equal(result.success,false);
  assert.equal(result.roll,3);
  assert.equal(result.damage,4);
  assert.equal(game._s.players[0].life,2);
  assert.deepEqual(result.lifeChanges,[{playerId:0,amount:-result.damage}]);
  if(game._s.phase==='casting')assert.equal(game._s.activeIndex,1);
});

test('score mode awards attacker, survivors, and secret bonuses',()=>{
  const game=started({playerCount:3,mode:'score'});
  game._s.players[0].rack=[7,8];
  game._s.players[0].secrets=[4];
  game._s.players[1].life=6;
  game._s.players[2].life=1;
  game.cast(7);
  assert.equal(game._s.phase,'round-complete');
  assert.deepEqual(game._s.roundResult.points,[4,1,0]);
  assert.deepEqual(game._s.players.map(player=>player.score),[4,1,0]);
});

test('score mode ends only with one highest player at eight or more points',()=>{
  const tied=started({playerCount:3,mode:'score'});
  tied._s.players[0].score=8;
  tied._s.players[1].score=8;
  tied._finishRound({kind:'self-fail',loserIds:[2]});
  assert.equal(tied._s.phase,'round-complete');
  assert.deepEqual(tied._s.gameWinnerIds,[]);

  const unique=started({playerCount:3,mode:'score'});
  unique._s.players[0].score=8;
  unique._s.players[1].score=7;
  unique._finishRound({kind:'self-fail',loserIds:[2]});
  assert.equal(unique._s.phase,'game-complete');
  assert.deepEqual(unique._s.gameWinnerIds,[0]);
});

test('single mode ends immediately without changing scores',()=>{
  const game=started({playerCount:3,mode:'single'});
  game._s.players[0].rack=[8];
  game.cast(8);
  assert.equal(game._s.phase,'game-complete');
  assert.deepEqual(game._s.players.map(player=>player.score),[0,0,0]);
  assert.deepEqual(game._s.gameWinnerIds,[0]);
  assert.equal(game._s.roundResult.kind,'empty-rack');
});

test('empty-rack victory denies other players survival and secret points',()=>{
  const game=started({playerCount:3,mode:'score'});
  game._s.players[0].rack=[8];
  game._s.players[0].secrets=[4];
  game._s.players[1].secrets=[5,6];
  game.cast(8);
  assert.deepEqual(game._s.roundResult.points,[4,0,0]);
  assert.deepEqual(game._s.players.map(player=>player.life),[6,0,0]);
});

test('self-elimination has no round winner in score mode',()=>{
  const game=started({playerCount:3,mode:'score'});
  game._s.players[0].rack=[8];
  game._s.players[0].life=1;
  game.cast(7);
  assert.deepEqual(game._s.roundResult.winnerIds,[]);
  assert.deepEqual(game._s.roundResult.points,[0,1,1]);
});

test('AI probability uses public knowledge rather than its actual rack',()=>{
  const game=started({playerCount:4});
  game._s.activeIndex=1;
  const before=game.spellProbabilityFor(1,8);
  const swapIndex=game._s.drawPile.findIndex(spell=>spell!==game._s.players[1].rack[0]);
  const temporary=game._s.players[1].rack[0];
  game._s.players[1].rack[0]=game._s.drawPile[swapIndex];
  game._s.drawPile[swapIndex]=temporary;
  assert.equal(game.spellProbabilityFor(1,8),before);
  const action=game.botAction();
  assert.equal(action.playerId,1);
  assert.ok(['cast','stop'].includes(action.type));
});

test('AI remembers failed declarations until it draws a new stone',()=>{
  const game=started({playerCount:3,seed:'failed-declaration-memory'});
  const actor=game._s.players[1];
  actor.isHuman=false;
  actor.rack=[2,3,4,5,6];
  game._s.activeIndex=actor.id;

  const failed=game.cast(8);
  assert.equal(failed.success,false);
  assert.deepEqual(actor.ruledOutSpells,[8]);

  game._s.activeIndex=actor.id;
  assert.equal(game._rankBotSpells(actor).some(candidate=>candidate.spell===8),false);

  assert.equal(game.cast(2).success,true);
  assert.deepEqual(actor.ruledOutSpells,[8]);
  game.stop();
  assert.deepEqual(actor.ruledOutSpells,[]);
  assert.equal(actor.rack.length,5);
});

test('AI-only simulations terminate in both modes for every table size',()=>{
  for(const mode of ['single','score'])for(const playerCount of [2,3,4,5])for(let sample=0;sample<4;sample++){
    const game=started({mode,playerCount,seed:`${mode}-${playerCount}-${sample}`});
    for(const player of game._s.players){player.isHuman=false;player.aiProfile={...AI_PROFILES[player.id%AI_PROFILES.length]};}
    let actions=0;
    while(game._s.phase!=='game-complete'&&actions<5000){
      if(game._s.phase==='round-complete')game.nextRound();
      else game.botAction();
      actions++;
    }
    assert.equal(game._s.phase,'game-complete',`${mode}/${playerCount}/${sample} did not finish`);
    assert.ok(game._s.gameWinnerIds.length>=1);
    assert.ok(allStones(game._s).length===36);
  }
});
