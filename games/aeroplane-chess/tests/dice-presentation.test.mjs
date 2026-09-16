import test from 'node:test';
import assert from 'node:assert/strict';
import {createDicePresentation,DICE_ROLL_MS} from '../web/dice-presentation.js';
import {createGame,rollDice,movePiece} from '../web/engine.js';

function setup(){
  let now=0,id=0,reveals=0;const timers=new Map();
  const gate=createDicePresentation({onReveal:()=>reveals++,setTimer:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimer:key=>timers.delete(key)});
  const advance=ms=>{now+=ms;for(const[key,t]of [...timers])if(t.at<=now){timers.delete(key);t.fn();}};
  return {gate,advance,reveals:()=>reveals};
}
test('result, legal-action phase, next player and roll/pass log stay hidden until the die settles',()=>{
  const {gate,advance}=setup(),s=createGame();gate.reset(s);
  rollDice(s,()=>.2); // No takeoff: authoritative turn already advances.
  let visible=gate.sync(s);assert.equal(gate.rolling,true);assert.equal(visible.die,null);assert.equal(visible.turn,0);assert.equal(visible.events.length,0);
  advance(DICE_ROLL_MS-1);visible=gate.sync(s);assert.equal(visible.rolls,0);
  advance(1);visible=gate.sync(s);assert.equal(gate.rolling,false);assert.equal(visible.die,2);assert.equal(visible.turn,1);assert.ok(visible.events.some(e=>e.type==='pass'));
});
test('click starts a spin before a response, and a fast result waits for the full animation',()=>{
  const {gate,advance}=setup(),s=createGame();gate.reset(s);gate.begin();assert.equal(gate.rolling,true);
  advance(80);gate.sync(s);assert.equal(gate.rolling,true);
  rollDice(s,()=>.99);assert.equal(gate.sync(s).phase,'roll');
  advance(DICE_ROLL_MS-81);assert.equal(gate.sync(s).die,null);
  advance(1);assert.equal(gate.sync(s).die,6);assert.equal(gate.sync(s).phase,'move');
});
test('a slow network response does not trigger a second wait and animation does not change the result',()=>{
  const {gate,advance}=setup(),s=createGame();gate.reset(s);gate.begin();advance(DICE_ROLL_MS+500);
  assert.equal(gate.rolling,true);rollDice(s,()=>.7);const authoritative=structuredClone(s);
  assert.deepEqual(gate.sync(s),authoritative);assert.equal(gate.rolling,false);assert.deepEqual(s,authoritative);
});
test('duplicate polling cannot restart a spin, and newer moves are held behind the same reveal',()=>{
  const {gate,advance,reveals}=setup(),s=createGame();gate.reset(s);rollDice(s,()=>.99);gate.sync(s);
  advance(300);gate.sync(s);movePiece(s,0);assert.equal(gate.sync(s).players[0].planes[0],-1);
  advance(DICE_ROLL_MS-300);const visible=gate.sync(s);assert.equal(visible.players[0].planes[0],0);assert.equal(reveals(),1);
  gate.sync(s);advance(2000);assert.equal(reveals(),1);assert.equal(gate.rolling,false);
});
test('restore, background return and a new game cancel queued reveals without replaying old rolls',()=>{
  const {gate,advance,reveals}=setup(),s=createGame();gate.reset(s);rollDice(s,()=>.99);gate.sync(s);
  gate.reset(s);assert.equal(gate.sync(s).die,6);assert.equal(gate.rolling,false);
  advance(1000);assert.equal(reveals(),0);
  const fresh=createGame();assert.equal(gate.sync(fresh).die,null);assert.equal(gate.rolling,false);
});
test('presentation does not use the game RNG',t=>{
  t.mock.method(Math,'random',()=>{throw Error('Presentation must not consume game randomness');});
  const {gate,advance}=setup(),s=createGame();gate.reset(s);gate.begin();rollDice(s,()=>.4);gate.sync(s);advance(DICE_ROLL_MS);
  assert.equal(gate.sync(s).die,3);
});
