import test from 'node:test';
import assert from 'node:assert/strict';
import {handleSteelArc} from '../server/api.mjs';
import {MemorySteelArcRoomStore} from '../server/rooms.mjs';

const request=(path,{method='GET',token,body}={})=>new Request(`http://table.local/api/steel-arc${path}`,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
const call=async(store,path,options)=>{const response=await handleSteelArc(request(path,options),null,{store,limit:()=>{}});return{status:response.status,data:await response.json()};};

test('steel expedition HTTP API creates, joins and starts a room',async()=>{
  const store=new MemorySteelArcRoomStore();
  const created=await call(store,'/rooms',{method:'POST',body:{name:'房主',maxPlayers:2}});assert.equal(created.status,201);
  const code=created.data.room.code,seatKey='a'.repeat(47)+'1';
  const joined=await call(store,`/rooms/${code}/join`,{method:'POST',body:{name:'好友',seatKey}});assert.equal(joined.status,200);assert.equal(joined.data.room.selfSlot,'B1');
  assert.equal((await call(store,`/rooms/${code}/ready`,{method:'POST',token:seatKey,body:{ready:true}})).status,200);
  const started=await call(store,`/rooms/${code}/start`,{method:'POST',token:created.data.token,body:{}});assert.equal(started.status,200);assert.deepEqual(started.data.game.turnOrder,['A1','B1']);
  const state=await call(store,`/rooms/${code}`,{token:created.data.token});assert.equal(state.status,200);assert.equal(state.data.room.status,'playing');
});

test('steel expedition HTTP API rejects bad methods, cross-site writes and invalid tokens',async()=>{
  const store=new MemorySteelArcRoomStore();
  const wrongMethod=await handleSteelArc(new Request('http://table.local/api/steel-arc/rooms',{method:'GET'}),null,{store});assert.equal(wrongMethod.status,404);
  const crossSite=await handleSteelArc(new Request('http://table.local/api/steel-arc/rooms',{method:'POST',headers:{Origin:'http://evil.local','Content-Type':'application/json'},body:'{}'}),null,{store});assert.equal(crossSite.status,403);
  const created=await call(store,'/rooms',{method:'POST',body:{name:'房主',maxPlayers:2}});
  const unauthorized=await call(store,`/rooms/${created.data.room.code}`,{token:'0'.repeat(48)});assert.equal(unauthorized.status,403);
});
