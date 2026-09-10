import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGame,applyAction,projectGame,legalActions,assertConservation} from '../web/engine.js';
import {AI_AVATARS,assignAIAvatars,resolveAIAvatars} from '../web/ai-avatars.js';
import {SplendorRooms} from '../server/rooms.mjs';
import {MemoryRoomStore} from '../../texas-holdem/server/rooms.mjs';

test('new games draw unique brand identities without changing rules or human identity',()=>{
 const seen=new Set();
 for(const n of [2,3,4])for(const value of [0,.999]){
  const g=createGame(Array.from({length:n},(_,seat)=>seat?'AI '+seat:'You'));
  const actions=legalActions(g);assignAIAvatars(g,[0],{rng:()=>value});
  assert.equal(g.players[0].name,'You');assert.equal(g.players[0].avatarId,undefined);
  const ids=g.players.slice(1).map(p=>p.avatarId);assert.equal(new Set(ids).size,n-1);ids.forEach(id=>seen.add(id));
  assert.deepEqual(legalActions(g),actions);assertConservation(g);
  const after=applyAction(g,0,{type:'reserve',tier:1});
  for(let viewer=0;viewer<n;viewer++)assert.deepEqual(projectGame(after,viewer).players.map(p=>p.avatarId),g.players.map(p=>p.avatarId));
 }
 assert.deepEqual(seen,new Set(AI_AVATARS.map(a=>a.id)));
 const named=createGame(['GPT · AI','Bot','Bot','Bot']);assignAIAvatars(named,[0]);assert.equal(resolveAIAvatars(named.players,[0]).has(0),false);assert.ok(named.players.slice(1).every(p=>p.name!=='GPT · AI'));
});

test('old saves and AI takeover resolve stable unused avatars without mutating state',()=>{
 const legacy=createGame(['Human A','Human B','Old AI A','Old AI B']);
 const beforeLeave=resolveAIAvatars(legacy.players,[0,1]),afterLeave=resolveAIAvatars(legacy.players,[0]);
 assert.equal(beforeLeave.get(2).id,afterLeave.get(2).id);assert.equal(beforeLeave.get(3).id,afterLeave.get(3).id);assert.equal(afterLeave.size,3);
 const old=createGame(['GPT · AI','Claude','旧 AI','旧 AI']);old.players[2].avatarId='deepseek';old.players[3].avatarId='gpt';
 const before=structuredClone(old),first=resolveAIAvatars(old.players,[0,1]);
 assert.equal(first.has(0),false);assert.equal(first.has(1),false);
 const takeover=resolveAIAvatars(old.players,[0]);assert.equal(takeover.get(2).id,first.get(2).id);assert.equal(takeover.get(3).id,first.get(3).id);assert.equal(new Set([...takeover.values()].map(a=>a.id)).size,3);
 assert.deepEqual(resolveAIAvatars([...old.players].reverse(),[0]),takeover);assert.deepEqual(old,before);
 old.players[1].avatarId='https://unrelated.example/icon.svg';assert.ok(AI_AVATARS.includes(resolveAIAvatars(old.players,[0]).get(1)));
});

test('room AI avatars survive actions, polling and service reconstruction',async()=>{
 let now=100000;const store=new MemoryRoomStore(),service=new SplendorRooms(store,()=>now);
 const host=await service.create({name:'GPT · AI',capacity:4,seatKey:'a'.repeat(48)});
 let view=await service.request(host.room.code,host.token,'start',{version:0,requestId:'start-avatars-test'});
 const ids=view.game.players.map(p=>p.avatarId);assert.equal(ids[0],undefined);assert.equal(new Set(ids.slice(1)).size,3);
 if(view.game.current===0)view=await service.request(host.room.code,host.token,'action',{version:view.room.version,requestId:'take-avatar-test',action:{type:'reserve',tier:1}});
 now=view.room.deadline+1;
 view=await new SplendorRooms(store,()=>now).request(host.room.code,host.token,'state');
 assert.deepEqual(view.game.players.map(p=>p.avatarId),ids);assert.equal(view.game.players[0].name,'GPT · AI');
 assert.equal(resolveAIAvatars(view.game.players,view.room.members.map(m=>m.seat)).has(0),false);
});

test('all four avatar assets reuse the existing unmodified poker icons',async()=>{
 assert.equal(AI_AVATARS.length,4);
 for(const avatar of AI_AVATARS){
  const source=avatar.icon.replace('./assets/brands/','');
  const [icon,existing]=await Promise.all([readFile(new URL('../web/'+avatar.icon,import.meta.url)),readFile(new URL('../../texas-holdem/web/assets/brands/'+source,import.meta.url))]);
  assert.deepEqual(icon,existing);assert.ok(icon.length>0);
 }
});
