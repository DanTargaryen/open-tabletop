export const isOnlinePage=path=>/\/online(?:\.html)?\/?$/.test(path);
// Each invitation resumes only its own room, without discarding other seats.
export const IDENTITY='anime-campus.room.v1';
const read=(storage,key)=>{try{return JSON.parse(storage.getItem(key));}catch{return null;}};
const valid=value=>value&&/^[A-Z2-9]{6}$/.test(value.code)&&/^[a-f0-9]{48}$/.test(value.token);
export function loadIdentity(storage,requested=''){
 const code=requested.trim().toUpperCase(),legacy=read(storage,IDENTITY);
 const saved=code?read(storage,`${IDENTITY}:${code}`):legacy;
 if(valid(saved)&&(!code||saved.code===code))return saved;
 return valid(legacy)&&(!code||legacy.code===code)?legacy:null;
}
export function rememberIdentity(storage,value){
 if(!valid(value))return;
 try{storage.setItem(IDENTITY,JSON.stringify(value));storage.setItem(`${IDENTITY}:${value.code}`,JSON.stringify(value));}catch{}
}
export function forgetIdentity(storage,value){
 if(!value)return;
 try{storage.removeItem(`${IDENTITY}:${value.code}`);if(read(storage,IDENTITY)?.code===value.code)storage.removeItem(IDENTITY);}catch{}
}
export function reconcilePending(pending,version){return pending&&version<=pending.version?pending:null;}
