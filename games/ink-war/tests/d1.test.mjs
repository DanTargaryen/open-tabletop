import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {handleInkWar} from '../server/api.mjs';
import {D1InkWarRoomStore,inkWarD1Store} from '../server/d1-store.mjs';

async function database(t){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(await readFile(new URL('../../../deploy/cloudflare/migrations/0009_ink_war_rooms.sql',import.meta.url),'utf8'));
  const binding=()=>({
    prepare(query){let values=[];return {
      bind(...args){values=args;return this;},
      async first(){await Promise.resolve();return sql.prepare(query).get(...values)||null;},
      async run(){await Promise.resolve();return {meta:{changes:sql.prepare(query).run(...values).changes}};},
    };},
    async batch(statements){return Promise.all(statements.map(s=>s.run()));},
  });
  return {sql,binding};
}

test('D1 entry fails closed without migrated storage and survives independent Worker stores',async t=>{
  const {sql,binding}=await database(t),a=binding(),b=binding();let now=Date.now();
  const base='https://ink.example/api/ink-war',ip=randomUUID();
  const call=async(db,path,{body,token,status=200,origin}={})=>{
    const response=await handleInkWar(new Request(base+path,{method:body?'POST':'GET',headers:{'cf-connecting-ip':ip,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})}),db,{clock:()=>now});
    const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;
  };
  await call(null,'/health',{status:503});
  const broken={prepare(){throw Error('missing schema');}};
  await call(broken,'/health',{status:503});
  await call(a,'/health');assert.equal(inkWarD1Store(a),inkWarD1Store(a));
  assert.notEqual(inkWarD1Store(a),inkWarD1Store(b));
  const key=randomBytes(24).toString('hex');
  const host=await call(a,'/rooms',{body:{name:'Host',playerCount:7,aiCount:5,seatKey:key},status:201}),path='/rooms/'+host.room.code;
  const retry=await call(b,'/rooms',{body:{name:'Host',playerCount:7,aiCount:5,seatKey:key},status:201});assert.equal(retry.room.selfId,host.room.selfId);
  const guest=await call(b,path+'/join',{body:{name:'Guest',seatKey:randomBytes(24).toString('hex')}});
  for(const [db,player] of [[a,host],[b,guest]])await call(db,path+'/ready',{token:player.token,body:{ready:true,cardId:player.room.cardOptions[0].id}});
  await call(a,path+'/start',{token:host.token,body:{}});
  now+=5000;
  const before=sql.prepare('SELECT payload FROM ink_war_rooms').get().payload;
  await call(b,path,{status:403});await call(b,path,{token:guest.token,status:403,origin:'https://other.example'});
  assert.equal(sql.prepare('SELECT payload FROM ink_war_rooms').get().payload,before,'unauthorized requests cannot tick the game');
  const snapshot=await call(a,path,{token:host.token});assert.equal(snapshot.game.players.length,7);
  const orders=[host,guest].map((player,seat)=>({requestId:randomUUID(),unitIds:[snapshot.game.units.find(u=>u.owner===seat).id],target:{x:100+seat*100,y:100}}));
  const [left,right]=await Promise.all([call(a,path+'/action',{token:host.token,body:orders[0]}),call(b,path+'/action',{token:guest.token,body:orders[1]})]);
  assert.equal(left.room.status,'playing');assert.equal(right.room.status,'playing');
  const restored=await call(binding(),path,{token:guest.token});
  for(const order of orders)assert.deepEqual(restored.game.units.find(u=>u.id===order.unitIds[0]).target,order.target);
  const repeated=await call(binding(),path+'/action',{token:host.token,body:orders[0]});
  assert.equal(repeated.room.version,restored.room.version,'retry must not apply a second command');
  await call(b,path+'/action',{token:host.token,body:{...orders[0],target:{x:1,y:1}},status:409});
  assert.doesNotMatch(JSON.stringify(restored),/tokenHash|processed/);
  assert.ok(!sql.prepare('SELECT payload FROM ink_war_rooms').get().payload.includes(key));
  const persisted=await new D1InkWarRoomStore(a).get(host.room.code,now);
  const stale=await new D1InkWarRoomStore(b).cas(host.room.code,persisted.revision-1,persisted.room,persisted.expiresAt);assert.equal(stale,false);
  const store=new D1InkWarRoomStore(b);assert.equal(await store.get(host.room.code,persisted.expiresAt+1),null);
});

test('D1 create/join quota is shared across independent Worker bindings and cleanup preserves live rooms',async t=>{
  const {sql,binding}=await database(t),base='https://ink.example/api/ink-war',now=Date.now();
  t.mock.method(Date,'now',()=>now);
  sql.prepare('INSERT INTO ink_war_rooms VALUES(?,0,?,?)').run('OLD222','{}',now-1);
  sql.prepare('INSERT INTO ink_war_rooms VALUES(?,0,?,?)').run('LIVE22','{}',now+100000);
  const ip=randomUUID();
  for(let i=0;i<41;i++){
    const response=await handleInkWar(new Request(base+'/rooms',{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':ip},body:'{}'}),binding());
    assert.equal(response.status,i<40?400:429);
  }
  assert.equal(sql.prepare('SELECT code FROM ink_war_rooms WHERE code=?').get('OLD222'),undefined);
  assert.equal(sql.prepare('SELECT code FROM ink_war_rooms WHERE code=?').get('LIVE22').code,'LIVE22');
  assert.equal(sql.prepare('SELECT count FROM ink_war_limits').get().count,41);
});
