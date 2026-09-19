import test from 'node:test';
import assert from 'node:assert/strict';
import {DATA} from '../web/data.js';
import {createGame,step,startEncounter,projectGame,actorId,botAction,validSavedGame,steps,IMPLEMENTED_EVENTS} from '../web/engine.js';

const game=()=>createGame({first:0});
const choose=(s,value,answer)=>step(s,actorId(s),{type:'choose',value,answer},()=>.5);
function resolve(s){for(let i=0;s.pending&&i<40;i++){const id=actorId(s);s=step(s,id,botAction(projectGame(s,id),()=>.5),()=>.5);}return s;}
test('all 51 distinct fixed-map events can finish their resolution without orphaned prompts',()=>{
 const ids=[...new Set(DATA.map.map(m=>m.event))].filter(x=>!['rest','safe','finish'].includes(x));assert.equal(ids.length,51);assert.deepEqual([...IMPLEMENTED_EVENTS].sort(),ids.sort());
 for(const id of ids){const s=game();s.players.forEach((p,i)=>{p.pos=25+i;p.checkpoint=25;});const result=resolve(startEncounter(s,id,()=>.5));assert.ok(['ack','finished'].includes(result.phase),`${id}: ${result.phase}`);assert.equal(result.pending,null);assert.ok(validSavedGame(result),id);}
});
test('a checkpoint is acquired by crossing it; letter delivery and healing happen once',()=>{
 let s=game();s.players[0].pos=8;s.players[0].hp=2;s.players[0].letter=9;s=step(s,0,{type:'roll'},()=>0);s=step(s,0,{type:'move'});
 assert.equal(s.players[0].checkpoint,9);assert.equal(s.players[0].hp,3);assert.equal(s.players[0].coins,6);assert.equal(s.players[0].letter,null);assert.equal(s.phase,'ack');
});
test('a shield cancels a checkpoint reset while its separate consolation remains',()=>{
 let s=game();s.players[0].pos=40;s.players[0].checkpoint=33;s=startEncounter(s,'R12');assert.equal(s.pending.kind,'defense');s=choose(s,'shield');assert.equal(s.players[0].pos,40);assert.deepEqual(s.players[0].bag,['reroll']);
});
test('accepting a reset actually returns to the recorded checkpoint',()=>{
 let s=game();s.players[0].pos=40;s.players[0].checkpoint=33;s=choose(startEncounter(s,'R12'),'accept');assert.equal(s.players[0].pos,33);assert.ok(s.players[0].bag.includes('reroll'));
});
test('Taiga can reduce one backward movement to one space without spending a shield',()=>{
 let s=createGame({first:0,players:[{character:'toradora'},{character:'railgun'}]});s.players[0].pos=28;s=startEncounter(s,'T03');s=choose(s,'skill');assert.equal(s.players[0].pos,27);assert.equal(s.players[0].skillUsed,true);assert.deepEqual(s.players[0].bag,['shield']);
});
test('a full backpack pauses for a real replacement choice and resumes the event',()=>{
 let s=game();s.players[0].bag=['pass','bento','ticket'];s=startEncounter(s,'A04');s=choose(s,'reroll');assert.equal(s.pending.kind,'bag');s=choose(s,'0');assert.deepEqual(s.players[0].bag,['reroll','bento','ticket']);assert.equal(s.phase,'ack');
});
test('both simultaneous submissions are concealed until the second player commits',()=>{
 let s=startEncounter(game(),'K01');s=choose(s,'1');s=choose(s,'yes');s=choose(s,'0');assert.equal(actorId(s),1);assert.deepEqual(projectGame(s,1).pending.selections,{});assert.deepEqual(projectGame(s,0).pending.selections,{0:0});s=choose(s,'1');assert.equal(s.players[0].coins,5);assert.equal(s.players[1].coins,3);assert.match(s.log.at(-2).text,/同时揭示/);
});
test('an invited player may refuse, with the exact event fallback',()=>{
 let s=game();s.players[0].hp=1;s=startEncounter(s,'A03');s=choose(s,'1');s=choose(s,'no');assert.equal(s.players[0].hp,2);assert.equal(s.players[1].hp,3);assert.equal(s.phase,'ack');
});
test('shared movement to the goal resolves all participants before declaring winners',()=>{
 let s=game();s.players[0].pos=58;s.players[1].pos=58;s=startEncounter(s,'R09');s=choose(s,'1');s=choose(s,'yes');assert.equal(s.phase,'finished');assert.deepEqual(s.winners,[0,1]);
});
test('swap defense belongs to the targeted player and prevents both movements',()=>{
 let s=game();s.players[0].pos=23;s.players[1].pos=26;s.players[2].pos=3;s.players[3].pos=1;s=startEncounter(s,'K12');s=choose(s,'1');assert.equal(actorId(s),1);s=choose(s,'shield');assert.equal(s.players[0].pos,23);assert.equal(s.players[1].pos,26);assert.equal(s.players[0].bag.length,1);assert.equal(s.players[1].bag.length,0);
});
test('a memory answer is never included in an answering player projection',()=>{
 let s=startEncounter(game(),'A08');s=choose(s,'memory');const answer=[...s.pending.sequence];assert.deepEqual(projectGame(s,0).pending.sequence,answer);assert.equal(projectGame(s,1).pending.sequence,undefined);s=choose(s,'ready');assert.equal(projectGame(s,0).pending.sequence,undefined);s=choose(s,'answer',answer);assert.equal(s.players[0].coins,5);
});
test('insufficient payment and wrong-actor actions are rejected atomically',()=>{
 let s=game();s.players[0].coins=0;s=startEncounter(s,'T07');const before=JSON.stringify(s);assert.throws(()=>step(s,0,{type:'choose',value:'pay'}));assert.throws(()=>step(s,1,{type:'choose',value:'back'}));assert.equal(JSON.stringify(s),before);
});
test('raw dice come exclusively from the RNG and modifiers expire after moving',()=>{
 let s=game();s.players[0].boost=2;s.players[0].slow=1;s=step(s,0,{type:'roll',die:6},()=>0);assert.equal(s.die,1);assert.equal(steps(s),2);s=step(s,0,{type:'move'});assert.equal(s.players[0].pos,2);assert.equal(s.players[0].boost,0);assert.equal(s.players[0].slow,0);
});
test('a reroll must be accepted and cannot be chained indefinitely',()=>{
 let s=game();s.players[0].bag=['reroll','reroll'];s=step(s,0,{type:'roll'},()=>.99);s=step(s,0,{type:'item',item:'reroll'},()=>0);assert.equal(s.die,1);assert.throws(()=>step(s,0,{type:'item',item:'reroll'}));
});
test('fixed steps are explicit, not a fake roll or rerollable dice result',()=>{
 let s=game();s.players[0].fixed=true;s.players[0].bag=['reroll'];s=step(s,0,{type:'fixed'});assert.equal(s.die,4);assert.equal(s.dieSource,'fixed');assert.throws(()=>step(s,0,{type:'item',item:'reroll'}));
});
test('30 completed rounds terminate with deterministic public tie breakers',()=>{
 let s=game();s.phase='ack';s.turnCount=119;s.players.forEach(p=>p.pos=35);s.players[2].coins=8;s=step(s,0,{type:'next'});assert.equal(s.phase,'finished');assert.deepEqual(s.winners,[2]);
});
test('200 seeded games terminate and JSON save/restore preserves all next decisions',()=>{
 let seed=81274;const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let k=0;k<200;k++){let s=createGame({},rng),count=0;while(s.phase!=='finished'&&count++<1500){const a=actorId(s);s=step(s,a,botAction(projectGame(s,a),rng),rng);assert.ok(validSavedGame(s));if(count%17===0)s=JSON.parse(JSON.stringify(s));}assert.equal(s.phase,'finished');assert.ok(count<1500);}
});
test('AI invitations do not systematically gift every cooperative event to seat zero',()=>{
 let s=game();s.turn=2;s=startEncounter(s,'R09');const v=projectGame(s,2);assert.equal(botAction(v,()=>0).value,'0');assert.equal(botAction(v,()=>.99).value,'3');
});
test('direct swaps onto an unvisited rest point acquire its checkpoint',()=>{
 let s=game();s.players[0].pos=8;s.players[1].pos=9;s.players[1].bag=[];s=startEncounter(s,'K12');s=choose(s,'1');assert.equal(s.players[0].checkpoint,9);assert.equal(s.players[0].pos,9);
});
test('each active character skill has its specified effect and cannot be reused',()=>{
 for(const character of ['railgun','april','kaguya','violet','chuni']){
  let s=createGame({first:0,players:[{character},{character:character==='railgun'?'april':'railgun'}]});
  if(character==='railgun')s.players[0].slow=2;
  if(character==='april'||character==='chuni')s=step(s,0,{type:'roll'},()=>0);
  s=step(s,0,{type:'skill'},()=>.99);assert.equal(s.players[0].skillUsed,true);assert.equal(s.activeUsed,true);assert.throws(()=>step(s,0,{type:'skill'}));
  if(character==='railgun')assert.equal(s.players[0].slow,0);
  if(character==='april'){assert.equal(s.die,6);assert.equal(s.rerolled,true);}
  if(character==='chuni'){assert.equal(s.die,1);assert.equal(steps(s),6);}
  if(character==='kaguya')assert.equal(s.players[0].bag.filter(x=>x==='shield').length,2);
  if(character==='violet')assert.equal(s.players[0].letter,9);
 }
});
test('damaged saves cannot resume with missing movement fields or empty pending choices',()=>{const s=game();delete s.players[0].slow;assert.equal(validSavedGame(s),false);const t=game();t.phase='event';t.pending={actor:0,options:[]};assert.equal(validSavedGame(t),false);});
test('one shield cancels the whole equipment-overheating penalty, preserving its separate compensation',()=>{let s=choose(startEncounter(game(),'R07'),'shield');assert.equal(s.players[0].hp,3);assert.equal(s.players[0].slow,0);assert.equal(s.players[0].coins,4);});
test('a real mood loss makes healing useful and a fatal event resolves before a goal win',()=>{
 let s=choose(startEncounter(game(),'R07'),'accept');assert.equal(s.players[0].hp,2);assert.equal(s.players[0].slow,1);
 let t=game();t.players[0].hp=1;t.players[0].pos=60;t.players[0].checkpoint=49;t.players[0].bag=[];t=startEncounter(t,'X11');assert.equal(t.phase,'ack');assert.equal(t.players[0].pos,49);assert.equal(t.players[0].hp,3);assert.deepEqual(t.winners,[]);assert.equal(t.players[0].slow,0);
});
