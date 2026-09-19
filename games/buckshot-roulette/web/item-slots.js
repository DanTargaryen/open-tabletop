// Several queued actions can consume items before the final snapshot rebinds slots.
export function findVisibleItemSlot(cells,{slot=null,id=null}={}){
  if(Number.isInteger(slot)){
    const byPick=cells.find(cell=>cell?.faceUp&&cell.hinge.userData.pick?.slot===slot);
    if(byPick&&(!id||byPick.id===id))return byPick;
    const visual=cells[slot];
    if(visual?.faceUp&&(!id||visual.id===id))return visual;
  }
  if(id)return cells.find(cell=>cell?.faceUp&&cell.id===id)||null;
  return null;
}
