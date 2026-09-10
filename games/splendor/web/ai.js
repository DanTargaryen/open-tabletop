import {legalActions, price, total, emptyTokens, COLORS, TOKENS} from './engine.js';
export const AI_STYLES = [
  {id:'balanced', name:'青岚', label:'均衡商人'},
  {id:'prestige', name:'赤砚', label:'声望竞速'},
  {id:'patron', name:'月白', label:'进化路线'},
];
const sum = xs => xs.reduce((a,b) => a+b,0);
function distance(player, card) {
  const due = price(player, card);
  return Math.max(0, sum(COLORS.map(c => Math.max(0,due[c]-player.tokens[c]))) + due.master - player.tokens.master);
}
function cardValue(state, player, card, style) {
  const evolutionNeed = pEvolutionNeed(player,card.bonus);
  const late = player.points >= 9 || state.finalRound;
  return card.points * (style === 'prestige' || late ? 4.2 : 3) +
    Math.max(.2, 2.8-player.bonuses[card.bonus]*.36) * card.bonusAmount + evolutionNeed * (style === 'patron' ? 2.4 : .7);
}
function pEvolutionNeed(player,color) { return Number(player.cards.some(c => (c.evolveCost?.[color]||0)>player.bonuses[color])); }
export function chooseAction(state, style = 'balanced') {
  // Callers provide the same redacted state a human sees. No deck or opponent hand access.
  const p = state.players[state.current], actions = legalActions(state);
  if (state.phase === 'return') {
    const tokens = emptyTokens(), kept = {...p.tokens};
    const targets = [...state.market.flat().filter(Boolean), ...p.reserved].sort((a,b) =>
      (cardValue(state,p,b,style)/(distance(p,b)+1))-(cardValue(state,p,a,style)/(distance(p,a)+1)));
    const due = targets[0] ? price(p,targets[0]) : emptyTokens();
    while (total(kept)>10) {
      const c = TOKENS.filter(c=>kept[c]>0).sort((a,b)=>(kept[b]-(due[b]||0)-(b==='master'?20:0))-(kept[a]-(due[a]||0)-(a==='master'?20:0)))[0];
      kept[c]--; tokens[c]++;
    }
    return {type:'return',tokens};
  }
  if (!actions.length) return actions[0];
  if (state.phase === 'evolve') return actions.filter(a=>a.type==='evolve').sort((a,b)=>{const all=[...state.market.flat().filter(Boolean),...p.reserved];return all.find(c=>c.id===b.cardId).points-all.find(c=>c.id===a.cardId).points;})[0]||actions[0];
  const cards = [...state.market.flat().filter(Boolean), ...p.reserved];
  let best = actions[0], bestScore = -Infinity;
  for (const a of actions) {
    let score = -100;
    const card = cards.find(c=>c.id===a.cardId);
    if (a.type==='buy') {
      score = 8 + cardValue(state,p,card,style);
      if (card.evolvesToSpeciesId && style==='patron') score += 1.2;
      if (p.points+card.points>=18) score += 100;
    } else if (a.type==='take') {
      const after = {...p,tokens:{...p.tokens}};
      for (const c of a.colors) after.tokens[c]++;
      score = Math.max(...cards.map(c => {
        const beforeD=distance(p,c),afterD=distance(after,c), progress=beforeD-afterD;
        return progress>0 ? cardValue(state,p,c,style)/(afterD+1)+progress*1.2 : -5;
      }));
      score -= Math.max(0,total(after.tokens)-10)*3;
    } else if (a.type==='reserve' && card && state.bank.master && total(p.tokens)<10) {
      const d=distance(p,card);
      score = d<=3 ? cardValue(state,p,card,style)/(d+1)*.8 - p.reserved.length*2 : -20;
    } else if (a.type==='pass') score=-50;
    if (score>bestScore) { bestScore=score; best=a; }
  }
  return best;
}
