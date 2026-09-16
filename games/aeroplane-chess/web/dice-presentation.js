export const DICE_ROLL_MS = 650;

// Keep the previous public view until the roll settles. The authoritative state
// and its random result are never changed by this presentation-only gate.
export function createDicePresentation({onReveal=()=>{},duration=()=>DICE_ROLL_MS,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  let shown=null,pending=null,timer=null,rolling=false,elapsed=false,generation=0;
  function finish(){
    if(!rolling||!elapsed||!pending)return;
    shown=pending;pending=null;rolling=false;onReveal();
  }
  function begin(){
    if(rolling||!shown)return;
    rolling=true;elapsed=false;const current=++generation;
    timer=setTimer(()=>{if(current!==generation)return;timer=null;elapsed=true;finish();},duration());
  }
  function reset(next){
    if(timer!==null)clearTimer(timer);
    generation++;timer=null;rolling=false;elapsed=false;pending=null;shown=structuredClone(next);
    return shown;
  }
  return {
    get rolling(){return rolling;},
    begin,
    reset,
    sync(next){
      if(!shown||next.rolls<shown.rolls)return reset(next);
      if(next.rolls>shown.rolls){
        begin();pending=structuredClone(next);
        // A slow network response may arrive after the minimum spin duration.
        // Return its state now; the caller is already rendering this snapshot.
        if(elapsed){shown=pending;pending=null;rolling=false;}
      }else if(!rolling)shown=structuredClone(next);
      return shown;
    },
  };
}
