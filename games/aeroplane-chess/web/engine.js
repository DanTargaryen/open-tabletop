// Open Tabletop house rules. One deterministic ruleset shared by browser and server.
export const COLORS = [
  {name:'红色', ink:'#d95749', light:'#fbe6df', bot:'晴空'},
  {name:'金色', ink:'#bd8a23', light:'#fcf0ca', bot:'追风'},
  {name:'绿色', ink:'#48866e', light:'#e2eee4', bot:'云雀'},
  {name:'蓝色', ink:'#4289b2', light:'#e1eef5', bot:'海风'},
];
export const FINISH = 57;
export const STARTS = [42, 3, 16, 29];
export const TRACK = [
  [6,0],[7,0],[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],
  [9,6],[10,6],[11,6],[12,6],[13,6],[14,6],[14,7],[14,8],
  [13,8],[12,8],[11,8],[10,8],[9,8],[8,9],[8,10],[8,11],[8,12],[8,13],
  [8,14],[7,14],[6,14],[6,13],[6,12],[6,11],[6,10],[6,9],
  [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],[0,7],[0,6],
  [1,6],[2,6],[3,6],[4,6],[5,6],[6,5],[6,4],[6,3],[6,2],[6,1],
];
export const HOME = [
  Array.from({length:6},(_,i)=>[i+1,7]),
  Array.from({length:6},(_,i)=>[7,i+1]),
  Array.from({length:6},(_,i)=>[13-i,7]),
  Array.from({length:6},(_,i)=>[7,13-i]),
];
export const TAKEOFF = [[0,5],[9,0],[14,9],[5,14]];
export const AIRPORTS = [[.25,.25],[9.6,.25],[9.6,9.6],[.25,9.6]];
export const clone = value => structuredClone(value);
export const ringIndex = (color,progress) => progress>=1&&progress<=51 ? (STARTS[color]+progress-1)%52 : null;
export function planePoint(color, progress, piece) {
  if (progress === -1 || progress === FINISH) {
    const [x,y]=AIRPORTS[color];
    return [x+1.2+(piece%2)*1.9,y+1.25+Math.floor(piece/2)*1.9];
  }
  if(progress===0)return TAKEOFF[color];
  return progress>=52 ? HOME[color][progress-52] : TRACK[ringIndex(color,progress)];
}

export function createGame({playerCount=4,mode='solo',names=[]}={}) {
  if(!Number.isInteger(playerCount)||playerCount<2||playerCount>4)throw Error('请选择 2–4 支机队。');
  if(!['solo','local','online'].includes(mode))throw Error('模式无效。');
  const colors=playerCount===2?[0,2]:Array.from({length:playerCount},(_,i)=>i);
  return {schema:1,mode,phase:'roll',turn:0,die:null,rolls:0,eventId:0,winner:null,
    players:colors.map((color,id)=>({id,color,name:names[id]||(id===0?'你':mode==='local'?`玩家 ${id+1}`:COLORS[color].bot),isBot:mode==='solo'&&id!==0,planes:[-1,-1,-1,-1]})),
    events:[],lastMove:null};
}

export function validSavedGame(s) {
  return s?.schema===1&&['solo','local'].includes(s.mode)&&['roll','move','finished'].includes(s.phase)
    &&Array.isArray(s.players)&&Number.isInteger(s.turn)&&s.turn>=0&&s.turn<s.players.length
    &&s.players.length>=2&&s.players.length<=4
    &&s.players.every((p,i)=>p&&p.id===i&&Number.isInteger(p.color)&&p.color>=0&&p.color<4&&typeof p.name==='string'&&p.name.length<=64&&typeof p.isBot==='boolean'&&Array.isArray(p.planes)&&p.planes.length===4&&p.planes.every(n=>Number.isInteger(n)&&n>=-1&&n<=FINISH))
    &&new Set(s.players.map(p=>p.color)).size===s.players.length
    &&(s.die===null||(Number.isInteger(s.die)&&s.die>=1&&s.die<=6))
    &&(s.phase!=='move'||s.die!==null)&&Number.isSafeInteger(s.rolls)&&s.rolls>=0&&Number.isSafeInteger(s.eventId)&&s.eventId>=0
    &&Array.isArray(s.events)&&s.events.length<=32&&s.events.every(e=>e&&Number.isSafeInteger(e.id)&&typeof e.text==='string'&&e.text.length<500)
    &&(s.phase==='finished'?Number.isInteger(s.winner)&&s.players[s.winner]?.planes.every(p=>p===FINISH):s.winner===null);
}

function log(s,type,text,extra={}) {
  s.events.push({id:++s.eventId,type,text,...extra});
  s.events=s.events.slice(-32);
}
function nextTurn(s) { s.turn=(s.turn+1)%s.players.length;s.phase='roll'; }
export function legalPieces(s) {
  if(s.phase!=='move')return [];
  return s.players[s.turn].planes.flatMap((p,i)=>p<FINISH&&(p>=0||s.die===6)?[i]:[]);
}
export function rollDice(s,rng=Math.random) {
  if(s.phase!=='roll')throw Error('请先选择要移动的飞机。');
  const random=rng();
  if(!Number.isFinite(random)||random<0||random>=1)throw Error('骰子随机值无效。');
  s.die=Math.floor(random*6)+1;s.rolls++;s.phase='move';s.lastMove=null;
  const actor=s.players[s.turn];
  log(s,'roll',`${actor.name} 掷出 ${s.die} 点`,{player:actor.id,die:s.die});
  if(!legalPieces(s).length){log(s,'pass',`${actor.name} 没有可移动的飞机，轮到下一队`);nextTurn(s);}
  return s;
}

// Stops include the dice landing and each jump landing. Crossing ordinary track
// spaces never captures; the opposite home-lane crossing is a special flight hit.
export function moveRoute(color,from,die) {
  if(from===-1)return {stops:[0],kinds:['takeoff'],crossing:null};
  let end=from+die;
  if(end>FINISH)return {stops:[FINISH-(end-FINISH)],kinds:['bounce'],crossing:null};
  const stops=[end],kinds=['move'];let crossing=null;
  const fly=()=>{end+=12;stops.push(end);kinds.push('fly');crossing={color:(color+2)%4,progress:56};};
  if(end===19){fly();end+=4;stops.push(end);kinds.push('jump');}
  else if(end>0&&end<51&&(end-1)%4===2){end+=4;stops.push(end);kinds.push('jump');if(end===19)fly();}
  return {stops,kinds,crossing};
}
export function movePiece(s,piece) {
  if(!Number.isInteger(piece)||!legalPieces(s).includes(piece))throw Error('请选择高亮的可移动飞机。');
  const actor=s.players[s.turn],from=actor.planes[piece],route=moveRoute(actor.color,from,s.die),hits=[];
  for(const stop of route.stops){
    const index=ringIndex(actor.color,stop);
    for(const opponent of s.players){
      if(opponent.id===actor.id)continue;
      opponent.planes.forEach((p,i)=>{
        if(index!==null&&ringIndex(opponent.color,p)===index){opponent.planes[i]=-1;hits.push({player:opponent.id,piece:i});}
      });
    }
  }
  if(route.crossing)for(const opponent of s.players){
    if(opponent.color===route.crossing.color)opponent.planes.forEach((p,i)=>{
      if(p===route.crossing.progress){opponent.planes[i]=-1;hits.push({player:opponent.id,piece:i});}
    });
  }
  const to=route.stops.at(-1);actor.planes[piece]=to;
  const detail=to===FINISH?'抵达终点':route.kinds.includes('fly')?'沿虚线飞越':route.kinds.includes('jump')?'同色跳格':from===-1?'起飞':route.kinds.includes('bounce')?'在终点反弹':`前进 ${s.die} 格`;
  log(s,to===FINISH?'finish':hits.length?'capture':'move',`${actor.name} 的 ${piece+1} 号机${detail}${hits.length?`，撞回 ${hits.length} 架飞机`:''}`,{player:actor.id});
  s.lastMove={id:s.eventId,player:actor.id,piece,from,to,...route,hits};
  if(actor.planes.every(p=>p===FINISH)){s.phase='finished';s.winner=actor.id;log(s,'win',`${actor.name} 四机抵达，赢得本局！`);}
  else if(s.die===6){s.phase='roll';log(s,'bonus',`${actor.name} 掷出六点，可以再掷一次`);}
  else nextTurn(s);
  return s;
}

// AI only sees public board information. No future dice or remote model calls.
export function choosePiece(s) {
  const actor=s.players[s.turn];
  return legalPieces(s).map(piece=>{
    const trial=clone(s),before=actor.planes[piece];movePiece(trial,piece);
    const after=trial.players[actor.id].planes[piece],move=trial.lastMove;
    const score=(after===FINISH?1000:0)+move.hits.length*65+(before===-1?22:after-before)+after*.12;
    return {piece,score};
  }).sort((a,b)=>b.score-a.score||a.piece-b.piece)[0]?.piece??null;
}
export function botStep(s,rng=Math.random) {
  if(s.phase==='roll')return rollDice(s,rng);
  if(s.phase==='move')return movePiece(s,choosePiece(s));
  return s;
}
