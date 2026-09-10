export const HUMAN_AVATAR='./assets/players/human.png';

// Visual identities are independent of the three existing AI strategies.
export const AI_AVATARS=Object.freeze([
  {id:'gpt',name:'GPT',icon:'./assets/brands/chatgpt.svg'},
  {id:'claude',name:'Claude',icon:'./assets/brands/claude.svg'},
  {id:'deepseek',name:'DeepSeek',icon:'./assets/brands/deepseek.svg'},
  {id:'doubao',name:'豆包',icon:'./assets/brands/doubao.png'},
].map(Object.freeze));
const byId=id=>AI_AVATARS.find(avatar=>avatar.id===id);

// Called only when creating a new game; action clones and room storage retain it.
export function assignAIAvatars(game,humanSeats,{rng=Math.random}={}) {
  const humans=new Set(humanSeats);
  const humanNames=new Set(game.players.filter(p=>humans.has(p.seat)).map(p=>p.name.toLowerCase()));
  const pool=AI_AVATARS.filter(a=>!humanNames.has((a.name+' · AI').toLowerCase()));
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  let next=0;
  for(const player of game.players)if(!humans.has(player.seat)){
    const avatar=pool[next++];player.avatarId=avatar.id;player.name=avatar.name+' · AI';
  }
  return game;
}

// Old saves and departed humans get stable, unused portraits without changing
// their names, rules state or room version. Occupied human seats always stay human.
export function resolveAIAvatars(players,humanSeats) {
  const humans=new Set(humanSeats),result=new Map(),used=new Set();
  const ordered=[...players].sort((a,b)=>a.seat-b.seat);
  const bots=ordered.filter(p=>!humans.has(p.seat));
  for(const player of bots){const avatar=byId(player.avatarId);if(avatar&&!used.has(avatar.id)){result.set(player.seat,avatar);used.add(avatar.id);}}
  // Reserve an unused identity for human seats too, so a departure cannot
  // shift the fallback portraits of legacy AI seats later in seat order.
  for(const player of ordered)if(!result.has(player.seat)){
    const avatar=AI_AVATARS.find(a=>!used.has(a.id));
    if(avatar){result.set(player.seat,avatar);used.add(avatar.id);}
  }
  return new Map([...result].filter(([seat])=>!humans.has(seat)));
}
