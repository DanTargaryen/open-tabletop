// The cache belongs to one authenticated seat. No private engine data is stored here.
export function syncCursor(data){
 return {protocol:2,scope:data?.sync?.scope||'',version:data?.room?.version??-1,history:data?.sync?.history||''};
}

export function mergeRoomSnapshot(previous,payload,lastServerNow=-Infinity){
 const room=payload?.room;
 if(!room)return {resync:true};
 if(previous&&(room.code!==previous.room.code||room.selfId!==previous.room.selfId||room.version<previous.room.version||(room.version===previous.room.version&&room.serverNow<lastServerNow)))return {ignored:true};
 const v2=payload.sync?.protocol===2;
 const cacheMatches=!!previous&&previous.sync?.scope===payload.sync?.scope&&previous.sync?.history===payload.sync?.history;
 if(v2&&payload.sync.unchanged){
  if(!cacheMatches||room.version!==previous.room.version)return {resync:true};
  const data={...previous,room,sync:payload.sync};let gameChanged=false;
  if(data.game){
   const players=data.game.players.map(p=>{
    if(p.isBot)return p;
    const member=room.roster.find(m=>m.seat===p.id);
    const connected=!!member?.connected,personality=p.isHuman?'你':member?(connected?'真人玩家':'暂时离线'):'已离开';
    if(p.connected===connected&&p.personality===personality)return p;
    gameChanged=true;return {...p,connected,personality};
   });
   if(gameChanged)data.game={...data.game,players};
  }
  return {data,gameChanged};
 }
 if(!Object.hasOwn(payload,'game')||!Object.hasOwn(payload,'run'))return {resync:true};
 let run=payload.run;
 if(run&&!Object.hasOwn(run,'history')){
  if(!v2||!cacheMatches||!Array.isArray(previous.run?.history))return {resync:true};
  run={...run,history:previous.run.history};
 }
 return {data:{...payload,run},gameChanged:true};
}

export function pollDelay(data,{hidden=false,failures=0}={}){
 if(failures)return Math.min(10000,1000*2**Math.min(failures,4));
 if(hidden)return 5000;
 return data?.room.status==='playing'&&['preflop','flop','turn','river'].includes(data?.game?.phase)?1000:2000;
}
