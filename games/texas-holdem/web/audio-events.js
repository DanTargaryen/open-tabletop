// Only pass accepted, viewer-safe snapshots. No engine or hidden cards enter here.
export class PokerSoundEvents {
  constructor(){this.reset();}
  reset(){this.last=null;}
  observe(view,{bootstrap=false,announce=false}={}){
    if(!view){this.reset();return [];}
    const events=(view.history||[]).filter(e=>e.handNumber===view.handNumber);
    const frame={hand:view.handNumber,log:Math.max(0,...events.map(e=>e.id)),board:view.board?.length||0,
      complete:!!view.lastResult&&['complete','showdown'].includes(view.phase),actor:view.currentPlayerIndex};
    const previous=this.last;
    if(bootstrap||(!previous&&!announce)){this.last=frame;return [];}
    if(previous&&frame.hand===previous.hand&&frame.log<previous.log&&!previous.complete)return [];
    this.last=frame;
    const cues=[];
    const add=kind=>cues.push({kind,delay:cues.length*.15});
    const newHand=!previous||previous.hand!==frame.hand||(previous.complete&&!frame.complete);
    if(newHand){
      if(!frame.complete){add('deal');if(frame.actor===0)add('turn');}
      else if(previous)add(view.lastResult.winners?.some(w=>w.id===0&&w.amount>0)?'win':'result');
      return cues;
    }
    if(frame.complete&&!previous.complete){
      if(frame.board>previous.board)add('reveal');
      add(view.lastResult.winners?.some(w=>w.id===0&&w.amount>0)?'win':'result');
      return cues;
    }
    if(frame.complete)return cues;
    // Slow snapshots can contain several actions. Sound the latest one, never a backlog.
    const action=events.filter(e=>e.id>previous.log&&['check','call','raise','all-in','fold'].includes(e.type)).at(-1);
    if(action)add(({call:'chips',raise:'raise','all-in':'all-in',check:'check',fold:'fold'})[action.type]);
    if(frame.board>previous.board)add('reveal');
    if(frame.actor===0&&(previous.actor!==0||frame.board!==previous.board))add('turn');
    return cues;
  }
}
