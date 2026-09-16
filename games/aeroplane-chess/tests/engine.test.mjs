import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,rollDice,movePiece,moveRoute,legalPieces,choosePiece,botStep,FINISH,TRACK,HOME,ringIndex,planePoint,validSavedGame,clone} from '../web/engine.js';
const roll=(s,die)=>rollDice(s,()=> (die-.5)/6);
function moving(position,die=1){const s=createGame();s.players[0].planes[0]=position;roll(s,die);return s;}
test('board has 52 unique spaces, opposite seats, and geometrically correct shortcut intersections',()=>{
  assert.equal(TRACK.length,52);assert.equal(new Set(TRACK.map(p=>p.join(','))).size,52);
  assert.deepEqual(createGame({playerCount:2}).players.map(p=>p.color),[0,2]);
  for(let c=0;c<4;c++){
    const [x,y]=planePoint(c,19,0),[u,v]=planePoint(c,31,0);
    assert.deepEqual([(x+u)/2,(y+v)/2],HOME[(c+2)%4][4]);
    const [a,b]=planePoint(c,51,0),[d,e]=planePoint(c,52,0);assert.equal(Math.abs(a-d)+Math.abs(b-e),1);
  }
});
test('six launches only to the takeoff spot and grants another roll; other dice pass in the hangar',()=>{
  const s=createGame();roll(s,5);assert.equal(s.turn,1);assert.equal(s.phase,'roll');
  roll(s,6);assert.deepEqual(legalPieces(s),[0,1,2,3]);movePiece(s,2);
  assert.equal(s.players[1].planes[2],0);assert.equal(s.turn,1);assert.equal(s.phase,'roll');
  roll(s,1);movePiece(s,2);assert.equal(s.players[1].planes[2],1);assert.equal(s.turn,2);
});
test('invalid and out-of-phase moves cannot change state',()=>{
  const s=createGame(),before=clone(s);assert.throws(()=>movePiece(s,0));assert.deepEqual(s,before);
  roll(s,6);const waiting=clone(s);assert.throws(()=>roll(s,1));assert.throws(()=>movePiece(s,'0'));assert.throws(()=>movePiece(s,9));assert.deepEqual(s,waiting);
  assert.throws(()=>createGame({playerCount:5}));assert.throws(()=>createGame({playerCount:2.5}));
});
test('same-color jump stops after four; direct fly adds a jump while a jump into a fly does not',()=>{
  let s=moving(1,2);movePiece(s,0);assert.equal(s.players[0].planes[0],7);
  s=moving(18,1);movePiece(s,0);assert.deepEqual(s.lastMove.stops,[19,31,35]);
  s=moving(14,1);movePiece(s,0);assert.deepEqual(s.lastMove.stops,[15,19,31]);
  assert.deepEqual(moveRoute(0,46,1).stops,[47,51]);
  assert.deepEqual(moveRoute(0,50,1).stops,[51]);
});
test('captures all opponents on each landing, not on intermediate ordinary spaces',()=>{
  const s=moving(1,2),index=ringIndex(0,3);
  const enemyPos=Array.from({length:51},(_,i)=>i+1).find(p=>ringIndex(1,p)===index);
  const passedPos=Array.from({length:51},(_,i)=>i+1).find(p=>ringIndex(1,p)===ringIndex(0,2));
  s.players[1].planes=[enemyPos,enemyPos,passedPos,-1];
  movePiece(s,0);assert.deepEqual(s.players[1].planes,[-1,-1,passedPos,-1]);assert.equal(s.lastMove.hits.length,2);
});
test('flight hits the opposite home-lane intersection, and only that home square',()=>{
  const s=moving(18,1);s.players[2].planes=[56,56,55,FINISH];movePiece(s,0);
  assert.deepEqual(s.players[2].planes,[-1,-1,55,FINISH]);assert.equal(s.lastMove.hits.length,2);
});
test('own stacked planes move separately and private takeoff spots do not collide',()=>{
  const s=moving(0,2);s.players[0].planes=[0,0,-1,-1];s.players[1].planes[0]=0;movePiece(s,0);
  assert.deepEqual(s.players[0].planes,[2,0,-1,-1]);assert.equal(s.players[1].planes[0],0);
});
test('home lane does not jump, overshoot bounces, and completed planes cannot move',()=>{
  const s=moving(55,5);movePiece(s,0);assert.equal(s.players[0].planes[0],54);assert.ok(s.lastMove.kinds.includes('bounce'));
  const exact=moving(55,2);movePiece(exact,0);assert.equal(exact.players[0].planes[0],FINISH);
  exact.turn=0;roll(exact,6);assert.ok(!legalPieces(exact).includes(0));
});
test('four planes at finish wins immediately, even on a six, and locks further actions',()=>{
  const s=moving(51,6);s.players[0].planes=[51,57,57,57];movePiece(s,0);
  assert.equal(s.winner,0);assert.equal(s.phase,'finished');assert.throws(()=>roll(s,1));assert.throws(()=>movePiece(s,0));
});
test('AI chooses exact finish, remains deterministic, and never mutates the board while choosing',()=>{
  const s=moving(56,1);s.players[0].planes[1]=22;const before=clone(s);
  assert.equal(choosePiece(s),0);assert.deepEqual(s,before);assert.equal(choosePiece(s),0);
});
test('100 seeded complete matches conserve all planes and terminate with a legal winner',()=>{
  for(let seed=1;seed<=100;seed++){
    let rngState=seed;const rng=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};
    const s=createGame({playerCount:2+seed%3});let actions=0;
    while(s.phase!=='finished'&&actions++<15000){
      botStep(s,rng);assert.ok(validSavedGame(s));
      for(const p of s.players)assert.equal(p.planes.length,4);
    }
    assert.equal(s.phase,'finished',`seed ${seed}`);assert.ok(s.players[s.winner].planes.every(p=>p===FINISH));
  }
});
test('save validation rejects corrupt, cross-game and out-of-range state',()=>{
  assert.equal(validSavedGame(createGame()),true);
  assert.ok(!validSavedGame(null));assert.ok(!validSavedGame({schema:1}));
  for(const players of [null,{length:4},[null,null],[{},{}]])assert.ok(!validSavedGame({...createGame(),players}));
  const s=createGame();s.players[0].planes[0]=100;assert.ok(!validSavedGame(s));
});
