export const HUMAN_AVATARS=Object.freeze([
  {id:'blue',name:'蓝眸',icon:'./assets/players/human-blue.webp'},
  {id:'gold',name:'金发',icon:'./assets/players/human-gold.webp'},
  {id:'forest',name:'花影',icon:'./assets/players/human-forest.webp'},
  {id:'star',name:'星眸',icon:'./assets/players/human-star.webp'},
].map(Object.freeze));
export const HUMAN_AVATAR=HUMAN_AVATARS[0].icon;
export const validHumanAvatar=id=>id==null||id==='auto'||HUMAN_AVATARS.some(a=>a.id===id);
export const getHumanAvatar=(id,seat=0)=>HUMAN_AVATARS.find(a=>a.id===id)||HUMAN_AVATARS[((seat%4)+4)%4]||HUMAN_AVATARS[0];
export function selectHumanAvatarId(requested,used=[]) {
  const chosen=HUMAN_AVATARS.find(a=>a.id===requested);
  return (chosen||HUMAN_AVATARS.find(a=>!used.includes(a.id))||HUMAN_AVATARS[0]).id;
}
