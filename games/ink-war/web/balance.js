// Shared deterministic economy and automatic counterattacks (humans and AI).
export const CAPTURE_RECOVERY_SECONDS = 5;
export const COMEBACK_COOLDOWN = 20;
export const LAST_CITY_SKILL={id:'divine',tier:0,name:'神凌',description:'200名永久可控将士从天而降，守护最后一座城池，可调兵或吞兵养城。'};
export const COMEBACK_SKILLS = [
  {id:'volunteers',tier:1,name:'乡勇应召',description:'8名乡勇归阵。'},
  {id:'lightMarch',tier:1,name:'轻装疾行',description:'全军移速提高35%，持续12秒。'},
  {id:'muster',tier:1,name:'募兵急令',description:'产兵速度提高50%，持续10秒。'},
  {id:'firstStrike',tier:1,name:'先登夺城',description:'对中立城伤害翻倍，持续12秒。'},
  {id:'reinforce',tier:2,name:'援军入阵',description:'36名援军归阵。'},
  {id:'resolve',tier:2,name:'破釜沉舟',description:'全军回血，攻击与攻城提高60%，持续12秒。'},
  {id:'thunder',tier:2,name:'天雷荡寇',description:'雷击一处围城敌军，损失55%当前血量并减速8秒。'},
  {id:'deception',tier:2,name:'声东击西',description:'24名不可控奇兵快速突袭一座敌城，15秒后消散。'},
  {id:'walls',tier:2,name:'坚壁清野',description:'城池回复30%血量，受到伤害减少60%，持续12秒。'},
  {id:'ghosts',tier:3,name:'百鬼夜行',description:'随机清除各方60%的士兵，城池不受伤害。'},
  {id:'rush',tier:3,name:'急行军',description:'120名不可控突击兵分攻最近两座敌城，20秒后消散。'},
  {id:'celestial',tier:3,name:'神兵天降',description:'随机己方城旁降下100名永久可控援军，可吞兵养城。'},
];
export function productionPower(count){
  if(count<=0)return 0;
  return count<=4?[0,1,1.6,2.1,2.5][count]:2.5+.3*(count-4);
}
export function normalizeBalance(player){
  player.comeback??={used:[false,false,false],pressure:[0,0,0],lastAt:-1000,losses:[]};
  player.comeback.rescueUsed??=false;
  player.battleBuffs??={};
  return player.comeback;
}
export function balanceMetrics(state){
  const counts=Array(state.players.length).fill(0),strength=counts.slice();
  for(const city of state.cities)if(city.owner>=0)counts[city.owner]++;
  for(const unit of state.units)if(unit.hp>0)strength[unit.owner]+=Math.min(2,unit.hp/unit.maxHp);
  return {counts,strength};
}
export function comebackPressure(state,id,metrics=balanceMetrics(state)){
  const {counts,strength}=metrics,mine=counts[id];
  const rivals=state.players.filter(p=>p.id!==id&&p.alive!==false&&counts[p.id]>0).map(p=>({count:counts[p.id],strength:strength[p.id],levy:p.cards.includes('levy')?1.25:1})).sort((a,b)=>b.count-a.count||b.strength-a.strength);
  if(!mine||!rivals.length)return [false,false,false];
  // With 3–7 factions, one first capture cannot award aid to the entire field.
  const reference=rivals.length===1?rivals[0].count:Math.max(rivals[1].count,rivals[0].count>=3?rivals[0].count-1:0);
  const income=productionPower(mine)*(state.players[id].cards.includes('levy')?1.25:1);
  const rivalIncome=productionPower(reference)*rivals[0].levy;
  const losses=normalizeBalance(state.players[id]).losses.filter(time=>state.time-time<=20).length;
  const behind=reference>=mine+1;
  return [behind,behind&&income/rivalIncome<=.78,behind&&mine/reference<=.5&&(strength[id]<Math.max(...rivals.map(r=>r.strength),1)*.6||losses>=2)];
}
export function activateComebackSkill(state,playerId,skillId,{random,log,reinforce}){
  const player=state.players[playerId],skill=[...COMEBACK_SKILLS,LAST_CITY_SKILL].find(s=>s.id===skillId),homes=state.cities.filter(c=>c.owner===playerId);
  if(!skill||!player?.alive||!homes.length)throw Error('无法释放反击技能。');
  const anchor=homes[Math.floor(random()*homes.length)],buffs=player.battleBuffs??={},until=seconds=>state.time+seconds;
  const destinations=state.cities.filter(c=>c.owner>=0&&c.owner!==playerId).sort((a,b)=>Math.hypot(a.x-anchor.x,a.y-anchor.y)-Math.hypot(b.x-anchor.x,b.y-anchor.y)||a.id-b.id);
  if(!destinations.length)destinations.push(...state.cities.filter(c=>c.owner===-1).sort((a,b)=>Math.hypot(a.x-anchor.x,a.y-anchor.y)-Math.hypot(b.x-anchor.x,b.y-anchor.y)||a.id-b.id));
  const summon=(count,options={})=>reinforce(playerId,count,anchor.id,options);
  if(skillId==='volunteers')summon(8);
  if(skillId==='lightMarch')buffs.speedUntil=until(12);
  if(skillId==='muster')buffs.musterUntil=until(10);
  if(skillId==='firstStrike')buffs.firstStrikeUntil=until(12);
  if(skillId==='reinforce')summon(36);
  if(skillId==='resolve'){for(const u of state.units)if(u.owner===playerId)u.hp=u.maxHp;buffs.valorUntil=until(12);}
  if(skillId==='walls'){for(const c of homes)c.hp=Math.min(c.maxHp,c.hp+c.maxHp*.3);buffs.wallsUntil=until(12);}
  if(skillId==='thunder'){
    const target=homes.map(c=>({c,near:state.units.filter(u=>u.owner!==playerId&&Math.hypot(u.x-c.x,u.y-c.y)<=240)})).sort((a,b)=>b.near.length-a.near.length||a.c.id-b.c.id)[0];
    for(const u of target.near){u.hp=Math.max(.1,u.hp*.45);u.slowUntil=until(8);}
  }
  if(skillId==='deception'||skillId==='rush')summon(skillId==='rush'?120:24,{uncontrollable:true,expiresAt:until(skillId==='rush'?20:15),speedMultiplier:skillId==='rush'?3.5:2.5,objectives:destinations.slice(0,skillId==='rush'?2:1).map(c=>c.id)});
  if(skillId==='celestial')summon(100);
  if(skillId==='divine')summon(200,{emergency:true,burst:200,ownerLimit:Math.max(300,state.units.filter(u=>u.owner===playerId).length+200)});
  if(skillId==='ghosts'){
    const removed=new Set();
    for(const faction of state.players){const army=state.units.filter(u=>u.owner===faction.id);for(let i=army.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[army[i],army[j]]=[army[j],army[i]];}for(const u of army.slice(0,Math.ceil(army.length*.6)))removed.add(u.id);}
    state.units=state.units.filter(u=>!removed.has(u.id));state.lastGhostAt=state.time;
  }
  player.lastSkill={id:skill.id,name:skill.name,tier:skill.tier,at:state.time,description:skill.description};
  log('skill',`${player.name}触发${skill.tier===0?'绝境救援':['','一级','二级','三级'][skill.tier]+'反击'} · ${skill.name}！${skill.description}`,{playerId,cityId:anchor.id,skillId:skill.id,tier:skill.tier});
}
export function updateComebacks(state,ops){
  const metrics=balanceMetrics(state),pending=[],rescues=[];
  for(const player of state.players){
    const progress=normalizeBalance(player);
    progress.losses=progress.losses.filter(time=>state.time-time<=20);
    if(!metrics.counts[player.id]||player.alive===false){progress.pressure=[0,0,0];continue;}
    // A recorded city loss distinguishes the last stand from the one-city start.
    // Rescue is independent of the three tiers and their cooldown.
    if(metrics.counts[player.id]===1&&progress.losses.length&&!progress.rescueUsed){progress.rescueUsed=true;progress.rescueAt=state.time;rescues.push(player);}
    const eligible=comebackPressure(state,player.id,metrics);
    for(let tier=0;tier<3;tier++)progress.pressure[tier]=eligible[tier]?Math.min(10,progress.pressure[tier]+.1):0;
    const next=progress.used.findIndex(used=>!used);
    if(next>=0&&progress.pressure[next]+1e-6>=[6,8,8][next]&&state.time-progress.lastAt>=COMEBACK_COOLDOWN)pending.push({player,next});
  }
  for(const {player,next} of pending){
    const threatened=state.cities.some(c=>c.owner===player.id&&state.units.some(u=>u.owner!==player.id&&Math.hypot(u.x-c.x,u.y-c.y)<=240));
    const deck=COMEBACK_SKILLS.filter(s=>s.tier===next+1&&(s.id!=='ghosts'||state.time-(state.lastGhostAt??-1000)>=25)&&(s.id!=='thunder'||threatened));
    const skill=deck[Math.floor(ops.random()*deck.length)];
    player.comeback.used[next]=true;player.comeback.lastAt=state.time;player.comeback.pressure=[0,0,0];
    activateComebackSkill(state,player.id,skill.id,ops);
  }
  // Apply rescues after any random global purge in this tick.
  for(const player of rescues)activateComebackSkill(state,player.id,'divine',ops);
}
