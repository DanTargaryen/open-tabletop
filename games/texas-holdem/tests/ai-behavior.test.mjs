import test from 'node:test';
import assert from 'node:assert/strict';
import {PokerGame} from '../web/engine.js';

function giveHole(game,id,cards){
 const s=game._s,lists=[s.deck,s.board,s.burns,...s.players.map(p=>p.hole)];
 for(let i=0;i<2;i++){
  const old=s.players[id].hole[i],list=lists.find(list=>list.includes(cards[i])),index=list.indexOf(cards[i]);
  list[index]=old;s.players[id].hole[i]=cards[i];
 }
 // Fixtures retain a complete unique deck and all actual forced bets/actions.
 PokerGame.restore(game.serialize());
}

function opening(id,position,seed,cards){
 const game=new PokerGame({mode:'practice',difficulty:'standard',seed:'opening-'+seed});
 game.startHand();
 const desiredDealer=position==='button'?id:(id+3)%6;
 while(game._s.dealerIndex!==desiredDealer){
  while(game._s.phase!=='complete')game.act(game.legalActions().canFold?'fold':'check');
  game.startHand();
 }
 while(game._s.currentPlayerIndex!==id)game.act('fold');
 giveHole(game,id,cards);
 return game.botAction();
}

test('late-position stealing appears and varies by character, while early-position trash stays disciplined',()=>{
 const count=128,rates={};
 for(const[id,name]of [[2,'chatgpt'],[3,'claude'],[4,'glm']]){
  let button=0,early=0;
  for(let seed=0;seed<count;seed++){
   button+=Number(['raise','all-in'].includes(opening(id,'button',seed,['Qs','4d']).type));
   early+=Number(['raise','all-in'].includes(opening(id,'early',seed,['Qs','4d']).type));
  }
  rates[name]=button/count;assert.ok(button>early+count*.10);assert.equal(early,0);
 }
 assert.ok(rates.chatgpt>=.22&&rates.chatgpt<=.65);
 assert.ok(rates.glm>=.65&&rates.glm>rates.chatgpt);
 assert.ok(rates.claude<rates.chatgpt);
});

test('Claude plays a premium starting hand assertively instead of merely limping',()=>{
 let raised=0;
 for(let seed=0;seed<96;seed++)raised+=Number(opening(3,'early',seed,['As','Ad']).type==='raise');
 assert.ok(raised>=80,'premium hands should usually open with a legal raise');
});
