import test from 'node:test';
import assert from 'node:assert/strict';
import {loadIdentity,rememberIdentity,forgetIdentity,reconcilePending,IDENTITY,isOnlinePage} from '../web/room-sync.js';
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};};
test('invitations resume their matching seats and preserve other room identities',()=>{
 const s=storage(),one={code:'ABC234',token:'a'.repeat(48)},two={code:'DEF567',token:'b'.repeat(48)};
 rememberIdentity(s,one);assert.equal(loadIdentity(s,'DEF567'),null);
 rememberIdentity(s,two);assert.deepEqual(loadIdentity(s,'abc234'),one);assert.deepEqual(loadIdentity(s),two);
 forgetIdentity(s,one);assert.equal(loadIdentity(s,'ABC234'),null);assert.deepEqual(loadIdentity(s),two);
 forgetIdentity(s,two);assert.equal(loadIdentity(s),null);
});
test('legacy seats migrate without overriding a different invitation; corrupt storage is ignored',()=>{
 const s=storage(),one={code:'ABC234',token:'a'.repeat(48)};s.setItem(IDENTITY,JSON.stringify(one));
 assert.deepEqual(loadIdentity(s,'ABC234'),one);assert.equal(loadIdentity(s,'DEF567'),null);
 s.setItem(IDENTITY,'{');assert.equal(loadIdentity(s),null);s.setItem(IDENTITY,JSON.stringify({code:'ABC234',token:'bad'}));assert.equal(loadIdentity(s),null);
});
test('a newer server snapshot clears an uncertain request; same version keeps the retry key',()=>{
 const pending={version:7,requestId:'same-attempt'};
 assert.equal(reconcilePending(pending,7),pending);assert.equal(reconcilePending(pending,8),null);assert.equal(reconcilePending(null,8),null);
});

test('friend rooms recognize Node URLs and hosting canonical URLs',()=>{
 for(const path of ['/games/anime-campus/online.html','/games/anime-campus/online','/games/anime-campus/online/'])assert.equal(isOnlinePage(path),true,path);
 for(const path of ['/games/anime-campus/','/games/anime-campus/index.html','/games/anime-campus/index','/games/anime-campus/online-guide'])assert.equal(isOnlinePage(path),false,path);
});
