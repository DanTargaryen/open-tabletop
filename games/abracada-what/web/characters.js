export const CHARACTERS=Object.freeze([
  Object.freeze({key:'tower-seat-1',seat:0,model:'mage.glb',color:'#76d9d0'}),
  Object.freeze({key:'tower-seat-2',seat:1,model:'mage.glb',color:'#bb6fa8'}),
  Object.freeze({key:'tower-seat-3',seat:2,model:'mage.glb',color:'#6f9ed8'}),
  Object.freeze({key:'tower-seat-4',seat:3,model:'mage.glb',color:'#d58a51'}),
  Object.freeze({key:'tower-seat-5',seat:4,model:'mage.glb',color:'#b69ae8'}),
]);

export const DEFAULT_CHARACTER_KEY=CHARACTERS[0].key;
export const CHARACTER_KEYS=Object.freeze(CHARACTERS.map(character=>character.key));

export function normalizeCharacterKey(value,fallback=DEFAULT_CHARACTER_KEY){
  return CHARACTER_KEYS.includes(value)?value:fallback;
}

export function characterForKey(value){
  const key=normalizeCharacterKey(value);
  return CHARACTERS.find(character=>character.key===key)||CHARACTERS[0];
}

export function characterForSeat(seat){
  return CHARACTERS[Math.min(CHARACTERS.length-1,Math.max(0,Number(seat)||0))];
}
