import test from 'node:test'; import assert from 'node:assert/strict';
import {createGame, shoot, useItem, publicState, skipIfCuffed, itemBlockReason, stealTargets,
  resolveSteal, loadRound, chooseAi, viewState, applyOnlineAction, freezeGame, thawGame, eventForViewer,
  settleOnlineBoundary, chooseCompensation,
  ITEM_IDS, ITEM_CAP, MIN_HP, MAX_HP, CHALLENGE_MIN_HP, CHALLENGE_MAX_HP} from '../web/engine.js';
const fixed=()=>.2;
/* 直接摆弹仓时也要带实例 ID，手机记录靠它定位。 */
const chamber=(g,flags)=>{g.ammo=flags.map(live=>({id:g.nextAmmoId++,live}));return g.ammo};

test('new game chamber valid',()=>{const g=createGame({rng:fixed}); assert.equal(g.hp.player,g.maxHp); assert.equal(g.hp.ai,g.maxHp); assert.ok(g.maxHp>=MIN_HP&&g.maxHp<=MAX_HP); assert.ok(g.ammo.length>=2); assert.ok(g.ammo.some(s=>s.live)); assert.ok(g.ammo.some(s=>!s.live)); assert.ok(publicState(g).ammoCount>=2); assert.equal(g.turn,'player')});
test('createGame can start with the far side',()=>{assert.equal(createGame({rng:fixed,first:'ai'}).turn,'ai')});
test('opening hp is rolled 2-6 for both sides',()=>{
 assert.equal(createGame({rng:()=>0}).maxHp,MIN_HP);
 assert.equal(createGame({rng:()=>.999}).maxHp,MAX_HP);
 const g=createGame({rng:fixed});
 assert.equal(g.hp.player,g.maxHp);
 assert.equal(g.hp.ai,g.maxHp);
 assert.equal(publicState(g).maxHp,g.maxHp);
});
test('both sides open with two items from the eight item pool',()=>{const g=createGame({rng:fixed});
 for(const side of ['player','ai']){assert.equal(g.items[side].length,2);for(const item of g.items[side])assert.ok(ITEM_IDS.includes(item))}});
test('shoot opponent',()=>{const g=createGame({rng:fixed}); const n=g.ammo.length; const r=shoot(g,'player','ai'); assert.equal(g.ammo.length,n-1); assert.equal(r.target,'ai'); assert.equal(g.turn,'ai')});
test('blank self keeps turn',()=>{const g=createGame({rng:fixed});chamber(g,[false]);const r=shoot(g,'player','player');assert.equal(r.live,false);assert.equal(g.turn,'player')});
test('live self passes turn to ai',()=>{const g=createGame({rng:fixed});chamber(g,[true,false]);const r=shoot(g,'player','player');assert.equal(r.live,true);assert.equal(g.turn,'ai')});
test('cuffs let the same side act twice and always hand the turn back',()=>{const g=createGame({rng:fixed});g.items.player=['cuffs'];chamber(g,[false,false,false]);
 assert.equal(useItem(g,'player','cuffs').item,'cuffs');assert.equal(g.cuffed.ai,true);
 shoot(g,'player','ai');assert.equal(g.turn,'ai');
 assert.deepEqual(skipIfCuffed(g),{skip:true,actor:'ai'});assert.equal(g.cuffed.ai,false);assert.equal(g.turn,'player');
 assert.equal(skipIfCuffed(g),null)});
test('cuffs cannot be reapplied until the opponent really gets a turn',()=>{const g=createGame({rng:fixed});g.items.player=['cuffs','cuffs'];chamber(g,[false,false,false,false]);
 useItem(g,'player','cuffs');
 shoot(g,'player','player');/* 对自己打空弹，行动权仍在自己手上 */
 assert.equal(g.turn,'player');
 assert.equal(itemBlockReason(g,'player','cuffs'),'对手已经被手铐束缚');
 shoot(g,'player','ai');skipIfCuffed(g);/* 庄家被跳过，没有真正行动 */
 assert.equal(g.turn,'player');
 assert.equal(itemBlockReason(g,'player','cuffs'),'本段行动已经用过手铐');
 shoot(g,'player','ai');/* 这一次庄家真的拿到回合 */
 assert.equal(g.turn,'ai');assert.equal(g.cuffLock.player,false)});
test('items can be chained during the same turn',()=>{const g=createGame({rng:fixed});g.items.player=['cigarette','beer'];chamber(g,[true,false]);g.hp.player=2;assert.equal(useItem(g,'player','cigarette').item,'cigarette');assert.equal(g.hp.player,3);assert.equal(g.turn,'player');assert.equal(useItem(g,'player','beer').item,'beer');assert.equal(g.turn,'player');assert.equal(g.ammo.length,1)});
test('magnifier is blocked once the current shell is already known',()=>{const g=createGame({rng:fixed});g.items.player=['magnifier','magnifier'];chamber(g,[true,false]);
 useItem(g,'player','magnifier');
 assert.equal(itemBlockReason(g,'player','magnifier'),'已知当前弹药');
 assert.equal(useItem(g,'player','magnifier').error,'已知当前弹药')});
test('burner phone records a later shell and the position moves up as shells leave',()=>{const g=createGame({rng:fixed});g.items.player=['burnerPhone'];chamber(g,[false,true,false]);
 const r=useItem(g,'player','burnerPhone');
 assert.ok(r.position>=2,'手机只能报第 2 发及以后');
 const before=publicState(g).records.player;
 assert.equal(before.length,1);
 shoot(g,'player','player');/* 打掉第 1 发空弹，记录整体前移一位 */
 const after=publicState(g).records.player;
 assert.equal(after.length,1);
 assert.equal(after[0].position,before[0].position-1);
 assert.equal(after[0].live,before[0].live)});
test('burner phone needs at least two shells',()=>{const g=createGame({rng:fixed});g.items.player=['burnerPhone'];chamber(g,[true]);
 assert.equal(itemBlockReason(g,'player','burnerPhone'),'后续弹药不足')});
test('expired medicine either heals two or costs one, and can be lethal',()=>{
 const lucky=createGame({rng:()=>.2});lucky.items.player=['expiredMedicine'];lucky.hp.player=1;
 assert.equal(useItem(lucky,'player','expiredMedicine').delta,2);assert.equal(lucky.hp.player,3);
 const unlucky=createGame({rng:()=>.9});unlucky.items.player=['expiredMedicine'];unlucky.hp.player=1;
 const r=useItem(unlucky,'player','expiredMedicine');
 assert.equal(r.good,false);assert.equal(unlucky.hp.player,0);
 assert.equal(unlucky.over,true);assert.equal(unlucky.winner,'ai')});
test('expired medicine and cigarette are blocked at full health',()=>{const g=createGame({rng:fixed});g.items.player=['expiredMedicine','cigarette'];
 assert.equal(itemBlockReason(g,'player','expiredMedicine'),'生命值已满');
 assert.equal(itemBlockReason(g,'player','cigarette'),'生命值已满')});
test('saw cannot be stacked',()=>{const g=createGame({rng:fixed});g.items.player=['saw','saw'];chamber(g,[true,false]);
 useItem(g,'player','saw');
 assert.equal(itemBlockReason(g,'player','saw'),'枪管已经锯短');
 assert.equal(shoot(g,'player','ai').damage,2);
 assert.equal(g.saw.player,false,'无论打谁，增伤都要消耗')});
test('saw damage is consumed even when the shot is a blank',()=>{const g=createGame({rng:fixed});g.items.player=['saw'];chamber(g,[false,true]);
 useItem(g,'player','saw');
 assert.equal(shoot(g,'player','player').damage,0);
 assert.equal(g.saw.player,false)});
test('adrenaline consumes both items and resolves the stolen one as the thief',()=>{const g=createGame({rng:fixed});g.items.player=['adrenaline'];g.items.ai=['cigarette'];g.hp.player=1;chamber(g,[true,false]);
 const r=useItem(g,'player','adrenaline',{steal:'cigarette'});
 assert.equal(r.stolen,'cigarette');
 assert.equal(g.hp.player,2,'回血算在偷的人头上');
 assert.equal(r.itemRefill,true,'双方空手立刻补货');
 assert.ok(g.items.player.length>=1&&g.items.player.length<=3);
 assert.equal(g.items.player.length,g.items.ai.length);
 assert.equal(g.turn,'player','道具不交出行动权')});
test('adrenaline refuses illegal targets and other adrenaline',()=>{const g=createGame({rng:fixed});g.items.player=['adrenaline'];g.items.ai=['cigarette','adrenaline'];chamber(g,[true,false]);
 assert.deepEqual(stealTargets(g,'player'),[],'满血时香烟非法，肾上腺素不可偷');
 assert.equal(itemBlockReason(g,'player','adrenaline'),'对手没有可偷的道具');
 assert.equal(useItem(g,'player','adrenaline',{steal:'adrenaline'}).error,'对手没有可偷的道具');
 assert.equal(g.items.player.length,1,'非法目标不能白白消耗')});
test('adrenaline primes on inject then resolves the stolen item',()=>{const g=createGame({rng:fixed});g.items.player=['adrenaline'];g.items.ai=['cigarette'];g.hp.player=1;chamber(g,[true,false]);
 const primed=useItem(g,'player','adrenaline');
 assert.equal(primed.primed,true);
 assert.deepEqual(g.items.player,[]);
 assert.equal(g.adrenalineArmed.player,true);
 assert.equal(resolveSteal(g,'player','adrenaline').error,'这件道具现在偷不了');
 assert.deepEqual(g.items.ai,['cigarette'],'非法确认不消耗对方道具');
 const stolen=resolveSteal(g,'player','cigarette');
 assert.equal(stolen.stolen,'cigarette');
 assert.equal(g.hp.player,2);
 assert.equal(g.adrenalineArmed.player,false);
 assert.equal(stolen.itemRefill,true);
 assert.ok(g.items.player.length>=1&&g.items.ai.length>=1)});
test('adrenaline steals the clicked duplicate instance',()=>{
 const g=createGame({rng:fixed});
 g.items.player=['adrenaline'];
 g.items.ai=['beer','cigarette','beer'];
 chamber(g,[true,false,true]);
 useItem(g,'player','adrenaline');
 const r=resolveSteal(g,'player','beer',{slot:2});
 assert.equal(r.stolen,'beer');
 assert.equal(r.stealSlot,2);
 assert.deepEqual(g.items.ai,['beer','cigarette']);
});
test('adrenaline slot mismatch does not steal a different copy',()=>{
 const g=createGame({rng:fixed});
 g.items.player=['adrenaline'];
 g.items.ai=['beer','cigarette','beer'];
 chamber(g,[true,false,true]);
 useItem(g,'player','adrenaline');
 const r=resolveSteal(g,'player','cigarette',{slot:2});
 assert.equal(r.error,'这件道具现在偷不了');
 assert.deepEqual(g.items.ai,['beer','cigarette','beer']);
 assert.equal(g.adrenalineArmed.player,true);
});
test('online steal uses the requested slot',()=>{
 const g=createGame({rng:fixed});
 g.items.player=['adrenaline'];
 g.items.ai=['beer','saw','beer'];
 chamber(g,[true,false,true]);
 applyOnlineAction(g,'player',{type:'use',item:'adrenaline',slot:0});
 const r=applyOnlineAction(g,'player',{type:'steal',item:'beer',slot:2});
 assert.equal(r.stealSlot,2);
 assert.deepEqual(g.items.ai,['beer','saw']);
});
test('both empty inventories refill 1-3 items immediately',()=>{
 const g=createGame({rng:fixed});
 g.items.player=['beer'];g.items.ai=[];
 chamber(g,[true,false,true]);
 const r=useItem(g,'player','beer');
 assert.equal(r.itemRefill,true);
 assert.ok(g.items.player.length>=1&&g.items.player.length<=3);
 assert.equal(g.items.player.length,g.items.ai.length);
 assert.equal(g.round,1,'弹仓还没打空时不换轮');
});
test('reload clears notes and saw but keeps items up to the cap',()=>{const g=createGame({rng:fixed});g.items.player=['magnifier','saw'];chamber(g,[true]);
 useItem(g,'player','magnifier');useItem(g,'player','saw');
 const round=g.round;
 shoot(g,'player','ai');/* 打完最后一发触发装填 */
 assert.equal(g.round,round+1);
 assert.deepEqual(publicState(g).records.player,[]);
 assert.equal(g.saw.player,false);
 for(const side of ['player','ai'])assert.ok(g.items[side].length<=ITEM_CAP)});
test('refill never pushes a side past the cap',()=>{const g=createGame({rng:fixed});
 for(const side of ['player','ai'])g.items[side]=Array(ITEM_CAP).fill('saw');
 chamber(g,[true]);
 shoot(g,'player','ai');
 for(const side of ['player','ai'])assert.equal(g.items[side].length,ITEM_CAP)});
test('night pool never deals adrenaline',()=>{
 const g=createGame({mode:'night',bannedItems:['adrenaline'],rng:()=>.99});
 assert.equal(g.lighting,'night');
 assert.equal(g.itemPool.includes('adrenaline'),false);
 for(const side of ['player','ai'])for(const item of g.items[side])assert.notEqual(item,'adrenaline');
 g.items={player:[],ai:[]};
 g.round=2;
 loadRound(g);
 for(const side of ['player','ai'])for(const item of g.items[side])assert.notEqual(item,'adrenaline');
});
test('challenge starts in daylight',()=>{
 const g=createGame({mode:'challenge',rng:fixed});
 assert.equal(g.lighting,'day');
 assert.ok(g.itemPool.includes('adrenaline'));
});
test('challenge opening hp is rolled 6-10',()=>{
 assert.equal(createGame({mode:'challenge',rng:()=>0}).maxHp,CHALLENGE_MIN_HP);
 assert.equal(createGame({mode:'challenge',rng:()=>.999}).maxHp,CHALLENGE_MAX_HP);
 const g=createGame({mode:'challenge',rng:fixed});
 assert.equal(g.hp.player,g.maxHp);
 assert.equal(g.hp.ai,g.maxHp);
 assert.ok(g.maxHp>=CHALLENGE_MIN_HP&&g.maxHp<=CHALLENGE_MAX_HP);
});
test('challenge chambers stay at 2-4 shells each round',()=>{
 assert.equal(createGame({mode:'challenge',rng:()=>0}).ammo.length,2);
 assert.equal(createGame({mode:'challenge',rng:()=>.999}).ammo.length,4);
 const g=createGame({mode:'challenge',rng:fixed});
 assert.ok(g.ammo.length>=2&&g.ammo.length<=4);
 assert.ok(g.ammo.some(s=>s.live));
 assert.ok(g.ammo.some(s=>!s.live));
 g.round=2;
 g.rng=()=>.5;
 loadRound(g);
 assert.ok(g.ammo.length>=2&&g.ammo.length<=4);
});
test('challenge reload can become night and dumps leftover adrenaline',()=>{
 const g=createGame({mode:'challenge',rng:fixed});
 g.items.player=['adrenaline','saw'];
 g.items.ai=['adrenaline','beer'];
 g.round=2;
 let n=0;
 g.rng=()=>{n+=1;return n===1?.7:.2};
 loadRound(g);
 assert.equal(g.lighting,'night');
 for(const side of ['player','ai'])assert.equal(g.items[side].includes('adrenaline'),false);
 assert.equal(g.adrenalineArmed.player,false);
});
test('challenge reload stays day when the roll is below 60%',()=>{
 const g=createGame({mode:'challenge',rng:fixed});
 g.items.player=['adrenaline'];
 g.round=2;
 let n=0;
 g.rng=()=>{n+=1;return n===1?.2:.2};
 loadRound(g);
 assert.equal(g.lighting,'day');
 assert.ok(g.items.player.includes('adrenaline'));
});
test('chooseAi does nothing off turn',()=>{
 const g=createGame({rng:fixed});
 assert.equal(chooseAi(g,'pro'),null);
});
test('pro AI peeks the real order and shoots itself on a hidden blank',()=>{
 const g=createGame({rng:fixed});
 chamber(g,[false,true,true,true]);
 g.turn='ai';g.items.ai=[];g.notes.ai={};
 const r=chooseAi(g,'pro');
 assert.equal(r.target,'ai');
 assert.equal(r.live,false);
});
test('expert AI does not peek mixed shells and shoots itself when live chance is low',()=>{
 const g=createGame({rng:fixed});
 chamber(g,[true,false,false,false]);
 g.turn='ai';g.items.ai=[];g.notes.ai={};
 const r=chooseAi(g,'expert');
 assert.equal(r.target,'ai');
});
test('pro AI with the same mixed chamber shoots the player because it sees the live',()=>{
 const g=createGame({rng:fixed});
 chamber(g,[true,false,false,false]);
 g.turn='ai';g.items.ai=[];g.notes.ai={};g.hp.player=3;g.hp.ai=3;
 const r=chooseAi(g,'pro');
 assert.equal(r.target,'player');
 assert.equal(r.live,true);
});
test('pro AI saws before firing a live shell',()=>{
 const g=createGame({rng:fixed});
 chamber(g,[true,false]);
 g.turn='ai';g.items.ai=['saw'];g.hp.player=3;g.hp.ai=3;g.notes.ai={};
 const r=chooseAi(g,'pro');
 assert.equal(r.item,'saw');
});
test('expert AI uses the magnifier when the next shell is unknown',()=>{
 const g=createGame({rng:fixed});
 chamber(g,[true,false]);
 g.turn='ai';g.items.ai=['magnifier'];g.notes.ai={};
 const r=chooseAi(g,'expert');
 assert.equal(r.item,'magnifier');
});
test('pro AI does not waste a magnifier when it already knows the live',()=>{
 const g=createGame({rng:fixed});
 chamber(g,[true,false]);
 g.turn='ai';g.items.ai=['magnifier'];g.notes.ai={};g.hp.player=3;g.hp.ai=3;
 const r=chooseAi(g,'pro');
 assert.equal(r.target,'player');
});
test('expert AI refuses expired medicine at 1 hp',()=>{
 const g=createGame({rng:fixed});
 chamber(g,[false,true]);
 g.turn='ai';g.hp.ai=1;g.hp.player=3;g.items.ai=['expiredMedicine'];
 const r=chooseAi(g,'expert');
 assert.notEqual(r.item,'expiredMedicine');
});
test('online view hides opponent notes and the chamber order',()=>{
 const g=createGame({rng:fixed});
 g.names={player:'Host',ai:'Guest'};
 g.notes.player[g.ammo[0].id]=g.ammo[0].live;
 g.notes.ai[g.ammo[0].id]=g.ammo[0].live;
 const host=viewState(g,'player'),guest=viewState(g,'ai');
 assert.equal(host.names.player,'Host');assert.equal(guest.names.player,'Guest');
 assert.equal(host.known.player,g.ammo[0].live);assert.equal(host.known.ai,null);
 assert.equal(guest.records.ai.length,0);assert.equal(host.records.ai.length,0);
 assert.equal(JSON.stringify(guest).includes('"ammo":'),false);
 const frozen=freezeGame(g);assert.equal(frozen.rng,undefined);
 const thawed=thawGame(frozen,()=>.2);assert.equal(typeof thawed.rng,'function');
 const r=applyOnlineAction(thawed,'player',{type:'shoot',target:'opponent'});
 assert.equal(r.kind,'shoot');assert.equal(r.target,'ai');
 const peek={actor:'ai',item:'magnifier',revealed:true,live:true};
 assert.equal(eventForViewer(peek,'player').revealed,undefined);
 assert.equal(eventForViewer(peek,'ai').revealed,true);
});

test('victory achievements distinguish full, healthy, limit, night and pro wins',()=>{
 const full=createGame({rng:fixed});full.maxHp=4;full.hp={player:4,ai:1};chamber(full,[true]);
 let ids=shoot(full,'player','ai').achievements.map(entry=>entry.id);
 assert.ok(ids.includes('geniusThreshold'));assert.ok(ids.includes('tooEasy'));assert.ok(!ids.includes('limit'));

 const night=createGame({rng:fixed,mode:'night'});night.maxHp=4;night.hp={player:1,ai:1};chamber(night,[true]);
 ids=shoot(night,'player','ai').achievements.map(entry=>entry.id);
 assert.ok(ids.includes('lightsOut'));assert.ok(ids.includes('limit'));assert.ok(!ids.includes('tooEasy'));

 const pro=createGame({rng:fixed,aiDifficulty:'pro'});pro.hp.ai=1;chamber(pro,[true]);
 ids=shoot(pro,'player','ai').achievements.map(entry=>entry.id);
 assert.ok(ids.includes('godBleeds'));
});

test('comeback unlocks once after a two-health deficit is recovered',()=>{
 const g=createGame({rng:fixed});g.maxHp=5;g.hp={player:2,ai:4};chamber(g,[false,true]);
 g.items.player=['magnifier'];
 assert.deepEqual(useItem(g,'player','magnifier').achievements,[]);
 g.hp.player=4;g.items.player=['beer'];
 let ids=useItem(g,'player','beer').achievements.map(entry=>entry.id);
 assert.deepEqual(ids,['backFromHell']);
 g.hp.player=5;g.items.player=['saw'];
 ids=useItem(g,'player','saw').achievements.map(entry=>entry.id);
 assert.equal(ids.includes('backFromHell'),false);
});

test('dark hunter counts actual opponent damage across a night and triggers at dawn',()=>{
 const g=createGame({rng:fixed,mode:'challenge'});g.maxHp=8;g.hp={player:8,ai:8};
 g.lighting='night';g.achievementState.nightDamage.player=1;chamber(g,[true]);g.rng=()=>0;
 const r=shoot(g,'player','ai');
 assert.equal(g.lighting,'day');
 assert.ok(r.achievements.some(entry=>entry.id==='darkHunter'&&entry.actor==='player'));
 assert.equal(g.achievementState.nightDamage.player,0);
});

test('achievement actors are mapped for the other online seat',()=>{
 const event={actor:'player',achievements:[{id:'limit',actor:'player'},{id:'darkHunter',actor:'ai'}]};
 const guest=eventForViewer(event,'ai');
 assert.deepEqual(guest.achievements,[{id:'limit',actor:'ai'},{id:'darkHunter',actor:'player'}]);
});

const compensationGame=()=>createGame({rng:fixed,compensationEnabled:true});
function pendingBoundary(g,{weak='player',weakHp=2,strongHp=5,turn='ai'}={}){
  g.hp[weak]=weakHp;g.hp[weak==='player'?'ai':'player']=strongHp;g.turn=turn;
  g.ammo=[];g.pendingReload={beforeLighting:g.lighting,pendingTurn:turn};
}

test('single-player games keep the original immediate reload path',()=>{
 const g=createGame({rng:fixed});chamber(g,[false]);const round=g.round;
 shoot(g,'player','player');
 assert.equal(g.round,round+1);assert.ok(g.ammo.length>=2);assert.equal(g.pendingReload,undefined);
});

test('multiplayer opens compensation only when the actual next actor is the leader',()=>{
 const g=compensationGame();pendingBoundary(g);
 const opened=settleOnlineBoundary(g);
 assert.equal(opened.kind,'compensation_open');assert.equal(g.phase,'compensation');assert.equal(g.compensation.chooser,'player');
});

test('multiplayer skips compensation when the weak side has the next normal action',()=>{
 const g=compensationGame();pendingBoundary(g,{turn:'player'});
 const event=settleOnlineBoundary(g);
 assert.equal(event.kind,'reload');assert.equal(g.phase,'playing');assert.equal(g.round,2);
});

test('event-level rare roll offers exactly one power strip',()=>{
 const g=compensationGame();g.rng=()=>0;pendingBoundary(g);
 settleOnlineBoundary(g);
 assert.equal(g.compensation.rare,true);
 assert.equal(g.compensation.offers.filter(id=>id==='powerStrip').length,1);
 assert.notEqual(g.compensation.timeoutChoice,'powerStrip');
});

test('fruit knife creates a personal cap used by healing and full-health achievement',()=>{
 const g=compensationGame();pendingBoundary(g);settleOnlineBoundary(g);
 g.compensation.offers=['fruitKnife','reverseCoin'];
 chooseCompensation(g,'player',0);
 assert.equal(g.maxHpBySide.ai,5);
 g.hp.ai=4;g.turn='ai';g.items.ai=['cigarette'];useItem(g,'ai','cigarette');
 assert.equal(g.hp.ai,5);assert.equal(itemBlockReason(g,'ai','cigarette'),'生命值已满');
});

test('fuse reduces the first firearm hit of the upcoming round and then expires',()=>{
 const g=compensationGame();pendingBoundary(g);settleOnlineBoundary(g);
 g.compensation.offers=['spareFuse','reverseCoin'];chooseCompensation(g,'player',0);
 g.turn='ai';chamber(g,[true,false]);
 const shot=shoot(g,'ai','player');
 assert.equal(shot.damage,0);assert.equal(shot.rawDamage,1);assert.equal(shot.fuseBlocked,true);assert.equal(g.effects.fuse.player,null);
 const expiry=compensationGame();pendingBoundary(expiry);settleOnlineBoundary(expiry);
 expiry.compensation.offers=['spareFuse','reverseCoin'];chooseCompensation(expiry,'player',0);
 expiry.hp={player:4,ai:4};expiry.pendingReload={beforeLighting:expiry.lighting,pendingTurn:expiry.turn};
 const boundary=settleOnlineBoundary(expiry);
 assert.deepEqual(boundary.expiredFuses,['player']);assert.deepEqual(eventForViewer(boundary,'ai').expiredFuses,['ai']);
});

test('bore film is private, coin changes opener, and remote forces night',()=>{
 const film=compensationGame();pendingBoundary(film);settleOnlineBoundary(film);film.compensation.offers=['boreFilm','reverseCoin'];
 const event=chooseCompensation(film,'player',0);
 assert.equal(viewState(film,'player').records.player.length,2);assert.equal(viewState(film,'ai').records.ai.length,0);
 assert.equal(eventForViewer(event,'ai').item,'boreFilm');
 const coin=compensationGame();pendingBoundary(coin);settleOnlineBoundary(coin);coin.compensation.offers=['reverseCoin','boreFilm'];chooseCompensation(coin,'player',0);assert.equal(coin.turn,'player');
 const remote=compensationGame();remote.items.player=['adrenaline'];remote.items.ai=['adrenaline'];pendingBoundary(remote);settleOnlineBoundary(remote);remote.compensation.offers=['lightRemote','reverseCoin'];chooseCompensation(remote,'player',0);
 assert.equal(remote.lighting,'night');assert.equal(remote.items.player.includes('adrenaline'),false);assert.equal(remote.items.ai.includes('adrenaline'),false);
 remote.pendingReload={beforeLighting:'night',pendingTurn:'player'};remote.turn='player';settleOnlineBoundary(remote);
 assert.equal(remote.lighting,'day','常规模式只强制一个黑夜回合');
});

test('power strip enters hidden random death and clears every temporary system',()=>{
 const g=compensationGame();g.items={player:['saw'],ai:['cuffs']};g.cuffed.player=true;g.saw.ai=true;g.notes.player={7:true};
 pendingBoundary(g);settleOnlineBoundary(g);g.compensation.offers=['powerStrip','reverseCoin'];chooseCompensation(g,'player',0);
 assert.equal(g.randomDeath,true);assert.deepEqual(g.hp,{player:2,ai:2});assert.deepEqual(g.items,{player:[],ai:[]});
 assert.equal(g.ammo.length,0,'随机死亡模式彻底停用原弹仓');
 const view=viewState(g,'player');assert.equal(view.hp.player,null);assert.equal(view.ammoCount,null);assert.equal(view.liveCount,null);
 const rolls=[.49,.5];g.rng=()=>rolls.shift();
 const live=shoot(g,'ai','player');assert.equal(live.live,true);assert.equal(g.hp.player,1);assert.equal(g.ammo.length,0);
 const blank=shoot(g,'player','ai');assert.equal(blank.live,false);assert.equal(g.hp.ai,2);assert.equal(g.ammo.length,0);
 assert.equal(g.pendingReload,null,'独立随机射击不触发换弹或补偿');
});
