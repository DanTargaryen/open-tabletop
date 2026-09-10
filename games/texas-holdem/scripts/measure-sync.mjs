// Local comparison only: no network requests or production room data.
import {RoomService,MemoryRoomStore,projectRoom} from '../server/rooms.mjs';
import {syncCursor,mergeRoomSnapshot} from '../web/room-sync.js';
import {gzipSync} from 'node:zlib';
import {randomBytes,randomUUID} from 'node:crypto';

let now=1789000000000;
const store=new MemoryRoomStore(),service=new RoomService(store,()=>now);
const host=await service.create({name:'测量玩家一',mode:'practice'}),code=host.room.code,people=[host];
for(let i=1;i<6;i++)people.push(await service.request(code,null,'join',{name:'测量玩家'+(i+1),seatKey:randomBytes(24).toString('hex')}));
for(const p of people)await service.request(code,p.token,'ready',{ready:true});
await service.request(code,host.token,'start');
const cache=Array(6).fill(null),last=Array(6).fill(-Infinity);
const totals={polls:0,legacyBytes:0,optimizedBytes:0,legacyGzip:0,optimizedGzip:0,lightReplies:0,historyReplies:0};
let matureIdle;
const sizes=payload=>{const bytes=Buffer.from(JSON.stringify(payload));return {raw:bytes.length,gzip:gzipSync(bytes).length};};
function merge(i,payload){const result=mergeRoomSnapshot(cache[i],payload,last[i]);if(!result.data)throw Error('Snapshot did not merge');cache[i]=result.data;last[i]=payload.room.serverNow;}
async function pollAll(){
 for(let i=0;i<6;i++){
  const payload=await service.request(code,people[i].token,'state',{_sync:syncCursor(cache[i])});
  merge(i,payload);
  const room=store.rows.get(code).room,legacy=projectRoom(room,room.members[i],now);
  const a=sizes(legacy),b=sizes(payload);totals.polls++;totals.legacyBytes+=a.raw;totals.optimizedBytes+=b.raw;totals.legacyGzip+=a.gzip;totals.optimizedGzip+=b.gzip;
  if(payload.sync.unchanged)totals.lightReplies++;
  if(payload.run?.history)totals.historyReplies++;
  if(room.engine.handNumber>=13&&payload.sync.unchanged&&!matureIdle)matureIdle={legacy:a,optimized:b};
 }
}
for(let hand=0;hand<25;hand++){
 while(store.rows.get(code).room.engine.phase!=='complete'){
  for(let second=0;second<5;second++){now+=1000;await pollAll();}
  const actor=store.rows.get(code).room.engine.currentPlayerIndex,view=cache[actor];
  merge(actor,await service.request(code,people[actor].token,'action',{requestId:randomUUID(),version:view.room.version,type:view.game.legalActions.canCheck?'check':'call',_sync:syncCursor(view)}));
 }
 now+=1000;await pollAll();
 if(hand<24){for(let i=0;i<6;i++)merge(i,await service.request(code,people[i].token,'ready',{ready:true,_sync:syncCursor(cache[i])}));now+=1600;await pollAll();}
}
const rounded=n=>Math.round(n*100)/100;
console.log(JSON.stringify({scenario:'25 six-player hands, every player checks/calls, five seconds between actions, one-second foreground polling. Compared v1 and v2 at exactly the same state. Poll response bodies only; action responses, headers, static assets and transport compression are not included. Local gzip comparison is not a measurement of live network encoding.',...totals,matureIdle,rawReductionPercent:rounded(100*(1-totals.optimizedBytes/totals.legacyBytes)),gzipReductionPercent:rounded(100*(1-totals.optimizedGzip/totals.legacyGzip)),averageBytesPerPoll:rounded(totals.optimizedBytes/totals.polls),averageGzipBytesPerPoll:rounded(totals.optimizedGzip/totals.polls),monthlySixPlayersTwoHoursEachDayRawGB:rounded(totals.optimizedBytes/totals.polls*1296000/1e9),monthlySixPlayersTwoHoursEachDayGzipGB:rounded(totals.optimizedGzip/totals.polls*1296000/1e9)},null,2));
