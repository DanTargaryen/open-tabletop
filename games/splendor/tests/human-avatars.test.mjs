import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {MemoryRoomStore} from '../../texas-holdem/server/rooms.mjs';
import {SplendorRooms} from '../server/rooms.mjs';
import {HUMAN_AVATARS,getHumanAvatar,selectHumanAvatarId} from '../web/human-avatars.js';
const key=()=>randomBytes(24).toString('hex');

test('automatic human avatars stay distinct across concurrent joins and retries',async()=>{
 const store=new MemoryRoomStore(),s=new SplendorRooms(store),hostKey=key();
 const host=await s.create({name:'Host',capacity:4,seatKey:hostKey});
 // A previous deployment may have no avatar metadata on its stored members.
 delete store.rows.get(host.room.code).room.members[0].humanAvatarId;
 const inputs=Array.from({length:3},(_,i)=>({name:'Guest '+i,seatKey:key()}));
 const guests=await Promise.all(inputs.map(input=>s.request(host.room.code,'','join',input)));
 const state=await s.request(host.room.code,host.token,'state');
 assert.equal(new Set(state.room.members.map(m=>m.humanAvatarId)).size,4);
 for(let i=0;i<3;i++){
  const retry=await s.request(host.room.code,'','join',{...inputs[i],humanAvatarId:'star'});
  assert.equal(retry.room.selfId,guests[i].room.selfId);
  assert.equal(retry.room.members.find(m=>m.id===retry.room.selfId).humanAvatarId,state.room.members.find(m=>m.id===retry.room.selfId).humanAvatarId);
 }
 const retried=await s.create({name:'Host',capacity:4,seatKey:hostKey,humanAvatarId:'star'});
 assert.equal(retried.room.code,host.room.code);assert.equal(retried.room.members.find(m=>m.id===host.room.selfId).humanAvatarId,'blue');
});

test('explicit choices are honored and external avatar URLs are rejected',async()=>{
 const store=new MemoryRoomStore(),s=new SplendorRooms(store);
 await assert.rejects(s.create({name:'Bad',capacity:2,seatKey:key(),humanAvatarId:'https://unrelated.example/a.png'}),e=>e.status===400);
 assert.equal(store.rows.size,0);
 const host=await s.create({name:'Host',capacity:2,seatKey:key(),humanAvatarId:'star'});
 const guest=await s.request(host.room.code,'','join',{name:'Guest',seatKey:key(),humanAvatarId:'star'});
 assert.ok(guest.room.members.every(m=>m.humanAvatarId==='star'));
 assert.equal(selectHumanAvatarId('auto',['blue','gold','forest']),'star');
 assert.equal(getHumanAvatar(undefined,2).id,'forest');assert.equal(HUMAN_AVATARS.length,4);
});

test('changing an avatar only updates the authenticated member and no game action or deadline',async()=>{
 let now=100000;const store=new MemoryRoomStore(),s=new SplendorRooms(store,()=>now);
 const host=await s.create({name:'Host',capacity:2,seatKey:key()});
 const guest=await s.request(host.room.code,'','join',{name:'Guest',seatKey:key()});
 let state=await s.request(host.room.code,guest.token,'ready',{version:guest.room.version,requestId:randomUUID(),ready:true});
 state=await s.request(host.room.code,host.token,'start',{version:state.room.version,requestId:randomUUID()});
 const before=structuredClone(store.rows.get(host.room.code).room),body={version:state.room.version,requestId:randomUUID(),humanAvatarId:'star',seat:1,memberId:guest.room.selfId};
 now=before.deadline+1;
 const changed=await s.request(host.room.code,host.token,'avatar',body);
 assert.equal(changed.room.version,before.version+1);assert.equal(changed.room.deadline,before.deadline);
 assert.equal(changed.room.members[0].humanAvatarId,'star');assert.equal(changed.room.members[1].humanAvatarId,'gold');
 const after=structuredClone(store.rows.get(host.room.code).room.game);after.players[0].humanAvatarId=before.game.players[0].humanAvatarId;
 assert.deepEqual(after,before.game);
 const repeated=await new SplendorRooms(store,()=>now).request(host.room.code,host.token,'avatar',body);assert.equal(repeated.room.version,changed.room.version);
 await assert.rejects(s.request(host.room.code,key(),'avatar',{...body,version:changed.room.version,requestId:randomUUID()}),e=>e.status===403);
});
