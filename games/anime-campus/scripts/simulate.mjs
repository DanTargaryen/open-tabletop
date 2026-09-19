import {writeFile,mkdir} from 'node:fs/promises';
import {createGame,step,actorId,botAction,projectGame,CHARACTERS} from '../web/engine.js';
const count=Number(process.argv[2]||1000);if(!Number.isInteger(count)||count<1||count>100000)throw Error('Use 1–100000 games');
let seed=20260916;const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),rounds=[],actions=[],seatWins=[0,0,0,0],characterGames={},characterWins={};let caps=0;
for(let i=0;i<count;i++){
 const roster=[...CHARACTERS];for(let j=roster.length-1;j>0;j--){const k=Math.floor(rng()*(j+1));[roster[j],roster[k]]=[roster[k],roster[j]];}
 let s=createGame({players:roster.slice(0,4).map(c=>({character:c.id,isBot:true}))},rng),n=0;s.players.forEach(p=>characterGames[p.character]=(characterGames[p.character]||0)+1);
 while(s.phase!=='finished'&&n++<1500){const id=actorId(s);s=step(s,id,botAction(projectGame(s,id),rng),rng);}
 if(s.phase!=='finished')throw Error(`Game ${i} did not terminate`);rounds.push(Math.min(s.round,30));actions.push(n);if(s.turnCount>=120)caps++;
 for(const winner of s.winners){seatWins[winner]+=1/s.winners.length;const id=s.players[winner].character;characterWins[id]=(characterWins[id]||0)+1/s.winners.length;}
 if((i+1)%250===0)console.log(`Completed ${i+1}/${count}`);
}
rounds.sort((a,b)=>a-b);actions.sort((a,b)=>a-b);const q=(a,p)=>a[Math.min(a.length-1,Math.floor(a.length*p))];
const report={games:count,seed:20260916,completed:count,roundCapGames:caps,rounds:{median:q(rounds,.5),p90:q(rounds,.9),min:rounds[0],max:rounds.at(-1)},actions:{median:q(actions,.5),p90:q(actions,.9)},seatWinShares:seatWins.map(n=>n/count),characters:CHARACTERS.map(c=>({id:c.id,games:characterGames[c.id]||0,winShare:(characterWins[c.id]||0)/(characterGames[c.id]||1)})),interpretation:'Descriptive seeded bot simulation; not human-duration or balanced-strength evidence.'};
await mkdir('work/anime-campus',{recursive:true});await writeFile('work/anime-campus/simulation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
