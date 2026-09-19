import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../../../deploy/cloudflare/worker.mjs';
test('Worker route and D1 SQL persist and recover a campus room using its own tables',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../../../deploy/cloudflare/migrations/0005_anime_campus_rooms.sql',import.meta.url),'utf8'));
 const db={
  prepare(sql){
   const prepared=sqlite.prepare(sql);
   function binding(args=[]){
    return {
     bind(...values){return binding(values);},
     async first(){return prepared.get(...args)??null;},
     async run(){return {meta:{changes:prepared.run(...args).changes}};}
    };
   }
   return binding();
  },
  async batch(statements){return Promise.all(statements.map(s=>s.run()));}
 };
 try{const env={DB:db},root='https://campus.example/api/anime-campus';const created=await worker.fetch(new Request(root+'/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'D1 host',character:'violet',playerCount:4})}),env);assert.equal(created.status,201);const data=await created.json();const resumed=await worker.fetch(new Request(root+'/rooms/'+data.room.code,{headers:{Authorization:'Bearer '+data.token}}),env);assert.equal(resumed.status,200);assert.equal((await resumed.json()).room.roster[0].character,'violet');assert.equal(sqlite.prepare('select count(*) n from anime_campus_rooms').get().n,1);assert.equal((await worker.fetch(new Request(root+'/health'),{})).status,503);}finally{sqlite.close();}
});
