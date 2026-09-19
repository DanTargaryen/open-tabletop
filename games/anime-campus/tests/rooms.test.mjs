import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileRoomStore} from '../../../server/room-store.mjs';
import {CampusRoomService,TURN_MS,AI_DELAY_MS} from '../server/rooms.mjs';
import {createGame,startEncounter,step} from '../web/engine.js';

async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'campus-room-')),store=await new FileRoomStore(join(dir,'rooms.json')).init();let now=Date.now();const service=new CampusRoomService(store,()=>now);t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});return {store,service,dir,tick:n=>now+=n,now:()=>now};}
test('joining retries are idempotent; identity hashes never appear in public snapshots',async t=>{
 const f=await fixture(t),host=await f.service.create({name:'Host',character:'railgun',playerCount:2}),code=host.room.code;
 const peer=await f.service.request(code,'','join',{name:'Guest',character:'april',seatKey:'a'.repeat(48)}),retry=await f.service.request(code,'','join',{name:'Guest',character:'april',seatKey:'a'.repeat(48)});
 assert.equal(peer.room.selfId,retry.room.selfId);assert.equal(retry.room.roster.length,2);assert.ok(!JSON.stringify(peer.room).includes('tokenHash'));
 const stored=await readFile(join(f.dir,'rooms.json'),'utf8');assert.ok(!stored.includes(host.token));await assert.rejects(f.service.request(code,'b'.repeat(48),'state'),{status:403});
});
test('one version admits only one action; exact retries cannot roll twice',async t=>{
 const f=await fixture(t),host=await f.service.create({name:'Host',character:'railgun',playerCount:2}),code=host.room.code;let snap=await f.service.request(code,host.token,'start');
 const row=await f.store.get(code,f.now());row.room.engine.turn=0;row.room.deadline=f.now()+TURN_MS;await f.store.cas(code,row.revision,row.room,row.expiresAt);snap=await f.service.request(code,host.token,'state');
 const body={type:'roll',die:99,requestId:'test-roll-one',version:snap.room.version};const [a,b]=await Promise.allSettled([f.service.request(code,host.token,'action',body),f.service.request(code,host.token,'action',{...body,requestId:'test-roll-two'})]);
 assert.equal([a,b].filter(x=>x.status==='fulfilled').length,1);assert.equal([a,b].find(x=>x.status==='rejected').reason.status,409);
 const won=a.status==='fulfilled'?body:{...body,requestId:'test-roll-two'},one=await f.service.request(code,host.token,'action',won),two=await f.service.request(code,host.token,'action',won);
 assert.equal(one.room.version,two.room.version);assert.equal(one.game.actionNumber,1);assert.ok(one.game.die>=1&&one.game.die<=6);
});
test('simultaneous decisions and memory answers are filtered for every viewer',async t=>{
 const f=await fixture(t),host=await f.service.create({name:'Host',character:'railgun',playerCount:2}),code=host.room.code,peer=await f.service.request(code,'','join',{name:'Guest',character:'april',seatKey:'c'.repeat(48)});
 let s=createGame({first:0,players:[{character:'railgun'},{character:'april'}]});s=startEncounter(s,'K01');s=step(s,0,{type:'choose',value:'1'});s=step(s,1,{type:'choose',value:'yes'});s=step(s,0,{type:'choose',value:'0'});
 let row=await f.store.get(code,f.now());row.room.engine=s;row.room.status='playing';row.room.deadline=f.now()+TURN_MS;await f.store.cas(code,row.revision,row.room,row.expiresAt);
 const a=await f.service.request(code,host.token,'state'),b=await f.service.request(code,peer.token,'state');assert.deepEqual(a.game.pending.selections,{0:0});assert.deepEqual(b.game.pending.selections,{});
 s=startEncounter(createGame({first:0,players:[{character:'railgun'},{character:'april'}]}),'A08');s=step(s,0,{type:'choose',value:'memory'});s=step(s,0,{type:'choose',value:'ready'});
 row=await f.store.get(code,f.now());row.room.engine=s;await f.store.cas(code,row.revision,row.room,row.expiresAt);
 assert.equal((await f.service.request(code,host.token,'state')).game.pending.sequence,undefined);assert.equal((await f.service.request(code,peer.token,'state')).game.pending.sequence,undefined);
});
test('leaving revokes identity and AI takes over; expired turns progress by one action',async t=>{
 const f=await fixture(t),host=await f.service.create({name:'Host',character:'railgun',playerCount:2}),code=host.room.code,peer=await f.service.request(code,'','join',{name:'Guest',character:'april',seatKey:'d'.repeat(48)});
 await f.service.request(code,peer.token,'ready',{ready:true});await f.service.request(code,host.token,'start');await f.service.request(code,peer.token,'leave');await assert.rejects(f.service.request(code,peer.token,'state'),{status:403});
 let row=await f.store.get(code,f.now());row.room.engine.turn=1;row.room.deadline=f.now()+AI_DELAY_MS;await f.store.cas(code,row.revision,row.room,row.expiresAt);const before=row.room.engine.actionNumber;f.tick(AI_DELAY_MS+1);
 const snapshot=await f.service.request(code,host.token,'state');assert.equal(snapshot.game.players[1].isBot,true);assert.equal(snapshot.game.actionNumber,before+1);
});
