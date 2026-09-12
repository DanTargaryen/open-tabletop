import test from 'node:test';
import assert from 'node:assert/strict';
import {SplendorAudio,SplendorSoundEvents,bindSplendorAudio,SOUND_KEY} from '../web/audio.js';
import {createGame,applyAction,projectGame,CARDS} from '../web/engine.js';
import {acquisitionEvents} from '../web/feedback-events.js';

const game=()=>createGame(['You','Friend','Bot'],{rng:()=>.4,first:0});
const take={type:'take',colors:['red','blue','pink']};
const kinds=cues=>cues.immediate.map(cue=>cue.kind);
const empty={immediate:[],acquisitions:[]};
const stored=value=>{const values=new Map(value===undefined?[]:[[SOUND_KEY,String(value)]]);return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
class Surface {
  constructor(){this.listeners=new Map();this.hidden=false;this.attributes=new Map();}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  emit(type,details={}){for(const fn of this.listeners.get(type)||[])fn({type,...details});}
  setAttribute(key,value){this.attributes.set(key,value);}
  getAttribute(key){return this.attributes.get(key);}
}
class Context {
  constructor(){this.state='running';this.currentTime=0;this.sampleRate=24000;this.destination={};this.sources=[];this.gains=[];this.resumeCalls=0;}
  createGain(){const node={connected:false,values:[],connect(){this.connected=true;},disconnect(){this.connected=false;}};
    node.gain={value:0,setValueAtTime:(...args)=>node.values.push(args),exponentialRampToValueAtTime:(...args)=>node.values.push(args)};this.gains.push(node);return node;}
  source(){const source={starts:[],stops:[],connected:false,connect(){this.connected=true;},disconnect(){this.connected=false;},start(t){this.starts.push(t);},stop(t){this.stops.push(t);},frequency:{setValueAtTime(){}}};this.sources.push(source);return source;}
  createOscillator(){return this.source();}
  createBufferSource(){return this.source();}
  createBuffer(_,count){const values=new Float32Array(count);return {getChannelData:()=>values};}
  resume(){this.resumeCalls++;this.state='running';return Promise.resolve();}
  close(){this.state='closed';return Promise.resolve();}
}
function setup({storage=stored(),context=new Context()}={}) {
  const document=new Surface(),window=new Surface(),button=new Surface();let creates=0,time=0;
  const audio=new SplendorAudio({storage,document,contextFactory:()=>{creates++;return context;},now:()=>time});
  return {audio,context,document,window,button,storage,creates:()=>creates,advance:ms=>{time+=ms;context.currentTime+=ms/1000;}};
}

test('actual take, blind reservation and forced return yield distinct confirmed cues',()=>{
  const events=new SplendorSoundEvents();let s=game();events.observe(projectGame(s,0));
  s=applyAction(s,0,take);assert.deepEqual(kinds(events.observe(projectGame(s,0))),['take']);
  s=applyAction(s,1,{type:'reserve',tier:1});const reserved=events.observe(projectGame(s,0));assert.deepEqual(kinds(reserved),['reserve']);assert.equal(reserved.immediate[0].seat,1);
  s=game();for(const [color,count] of Object.entries({red:4,blue:3,pink:3})){s.players[0].tokens[color]=count;s.bank[color]-=count;}
  const overflow=new SplendorSoundEvents();overflow.observe(s);
  s=applyAction(s,0,{type:'reserve',tier:1});assert.equal(s.phase,'return');assert.deepEqual(kinds(overflow.observe(s)),['reserve']);
  s=applyAction(s,0,{type:'return',tokens:{master:1}});assert.deepEqual(kinds(overflow.observe(s)),['return']);
});

test('capture and evolution sound are deferred once to acquisition feedback, including free cards',()=>{
  let s=game();const card=s.market[0][0];for(const [color,amount]of Object.entries(card.cost))s.players[0].bonuses[color]=amount;
  const events=new SplendorSoundEvents();events.observe(projectGame(s,0));
  let next=applyAction(s,0,{type:'buy',cardId:card.id});
  const captures=acquisitionEvents(projectGame(s,0),projectGame(next,0));
  const result=events.observe(projectGame(next,0),{acquisitions:captures});
  assert.deepEqual(result.immediate,[]);assert.equal(result.acquisitions.length,1);assert.equal(result.acquisitions[0].kind,'capture');assert.equal(result.acquisitions[0].eventKey,captures[0].key);
  assert.deepEqual(events.observe(projectGame(next,0),{acquisitions:captures}),empty);
  // A public replacement fixture exercises the same acquisition detector used
  // for animation, with no lookups of face-down evolution cards.
  s=game();const from=CARDS.find(c=>c.speciesId==='BULBASAUR'),to=CARDS.find(c=>c.speciesId==='IVYSAUR');
  s.players[0].cards=[from];s.version=5;s.phase='evolve';events.observe(null);events.observe(projectGame(s,0));
  next=structuredClone(s);next.players[0].cards=[to];next.players[0].evolved=[from];next.version++;
  const evolution=events.observe(projectGame(next,0),{acquisitions:acquisitionEvents(projectGame(s,0),projectGame(next,0))});
  assert.deepEqual(evolution.immediate,[]);assert.deepEqual(evolution.acquisitions.map(c=>c.kind),['evolve']);
});

test('repeated polls, stale packets, reconnect gaps and restored games cannot replay prior sounds',()=>{
  const events=new SplendorSoundEvents();let s=game();events.observe(s,{scope:'ROOM23',silent:true});
  s=applyAction(s,0,take);assert.equal(events.observe(s,{scope:'ROOM23'}).immediate.length,1);
  assert.deepEqual(events.observe(s,{scope:'ROOM23'}),empty);
  const stale=game();events.resync();assert.deepEqual(events.observe(stale,{scope:'ROOM23'}),empty);
  s=applyAction(s,1,take);assert.deepEqual(events.observe(s,{scope:'ROOM23'}),empty,'stale response must not consume reconnect suppression');
  s=applyAction(s,2,take);s=applyAction(s,0,{type:'reserve',tier:1});assert.deepEqual(events.observe(s,{scope:'ROOM23'}),empty,'version gap is silent');
  const restored=new SplendorSoundEvents();assert.deepEqual(restored.observe(s,{scope:'ROOM23'}),empty);
  assert.deepEqual(restored.observe(s,{scope:'OTHER2'}),empty);
  s=applyAction(s,1,{type:'reserve',tier:1});assert.equal(restored.observe(s,{scope:'OTHER2'}).immediate.length,1,'subsequent live state resumes sound');
});

test('a changed avatar or roster poll never produces a turn cue; actual turn entry does',()=>{
  const events=new SplendorSoundEvents();let s=game();events.observe(s);
  s=applyAction(s,0,take);events.observe(s);s=applyAction(s,1,take);events.observe(s);
  const before=structuredClone(s);s.players[0].humanAvatarId='changed';assert.deepEqual(events.observe(s),empty);
  s=applyAction(before,2,take);assert.deepEqual(kinds(events.observe(s)),['turn']);
  assert.deepEqual(events.observe(structuredClone(s)),empty);
});

test('explicit fresh starts and newly completed games sound once; restored terminal state stays silent',()=>{
  const events=new SplendorSoundEvents();let s=game();assert.deepEqual(kinds(events.observe(s,{start:true})),['start']);
  assert.deepEqual(events.observe(s,{start:true}),empty);
  s.current=2;s.phase='evolve';s.finalRound=true;s.players[0].points=18;events.observe(s,{silent:true});
  s=applyAction(s,2,{type:'finish'});assert.equal(s.phase,'complete');assert.deepEqual(kinds(events.observe(s)),['win']);
  assert.deepEqual(events.observe(s),empty);assert.deepEqual(new SplendorSoundEvents().observe(s,{start:true}),empty);
  events.observe(null);assert.deepEqual(kinds(events.observe(game(),{start:true})),['start']);
});

test('public sound observation does not touch decks, reserved identities or evolved card contents',()=>{
  const before=projectGame(game(),0),after=projectGame(applyAction(game(),0,{type:'reserve',tier:1}),0);
  for(const s of [before,after]){
    Object.defineProperty(s,'decks',{get(){throw Error('private deck read');}});
    for(const p of s.players){p.reserved=new Proxy(p.reserved,{get(target,key){if(key!=='length')throw Error('reserved identity read');return target.length;}});
      Object.defineProperty(p,'evolved',{get(){throw Error('private evolved card read');}});}
  }
  const events=new SplendorSoundEvents();events.observe(before);assert.deepEqual(kinds(events.observe(after)),['reserve']);
});

test('saved mute survives reload; initial render never creates or resumes Web Audio',async()=>{
  const f=setup({storage:stored(false)});bindSplendorAudio(f.audio,f.button,f);
  assert.equal(f.button.textContent,'音效：关');assert.equal(f.button.getAttribute('aria-pressed'),'false');assert.equal(f.button.title,'开启音效');assert.equal(f.creates(),0);
  await f.audio.unlock();assert.equal(f.creates(),0);assert.equal(f.audio.play('take'),false);
  f.button.emit('click');await Promise.resolve();assert.equal(f.audio.enabled,true);assert.equal(f.storage.getItem(SOUND_KEY),'true');assert.equal(f.button.getAttribute('aria-label'),'关闭音效');
  f.button.emit('click');assert.equal(f.storage.getItem(SOUND_KEY),'false');assert.equal(new SplendorAudio({storage:f.storage}).enabled,false);
});

test('trusted activation is required; pre-gesture events are dropped and never queued',async()=>{
  const f=setup();bindSplendorAudio(f.audio,f.button,f);
  const cue={kind:'capture',key:'before-unlock',seat:0,viewer:0};assert.equal(f.audio.ticket(cue),null);
  f.document.emit('pointerdown',{isTrusted:false});assert.equal(f.creates(),0);
  f.document.emit('keydown',{isTrusted:true});await Promise.resolve();assert.equal(f.creates(),1);assert.equal(f.context.sources.length,0);
  const ticket=f.audio.ticket({...cue,key:'live'});assert.equal(f.audio.playTicket(ticket),true);f.advance(1000);assert.equal(f.audio.playTicket(ticket),false,'same acquisition must not sound twice');
});

test('mute cancels scheduled notes and invalidates an animation sound accepted before mute',async()=>{
  const f=setup();await f.audio.unlock();const delayed=f.audio.ticket({kind:'capture',key:'deferred'});
  assert.equal(f.audio.play('evolve'),true);const active=[...f.context.sources];assert.ok(active.some(s=>s.starts[0]>.2));
  f.audio.setEnabled(false);assert.equal(f.audio.voices.size,0);assert.ok(active.every(s=>s.stops.includes(undefined)&&!s.connected));
  f.audio.setEnabled(true);await Promise.resolve();assert.equal(f.audio.playTicket(delayed),false);
  assert.equal(f.audio.ticket({kind:'capture'}).generation,f.audio.generation);
});

test('visibility and page lifecycle stop sound; return consumes the latest snapshot silently',async()=>{
  const f=setup(),events=new SplendorSoundEvents();bindSplendorAudio(f.audio,f.button,{...f,onResync:()=>events.resync()});
  f.document.emit('pointerdown',{isTrusted:true});await Promise.resolve();let s=game();events.observe(s);
  f.audio.play('evolve');const ticket=f.audio.ticket({kind:'capture',key:'delayed'});
  f.document.hidden=true;f.document.emit('visibilitychange');assert.equal(f.audio.voices.size,0);assert.equal(f.audio.ticket({kind:'take'}),null);
  s=applyAction(s,0,take);events.observe(s);f.document.hidden=false;f.document.emit('visibilitychange');
  s=applyAction(s,1,take);assert.deepEqual(events.observe(s),empty);assert.equal(f.audio.playTicket(ticket),false);
  s=applyAction(s,2,take);assert.deepEqual(kinds(events.observe(s)),['turn']);
  f.audio.play('capture');f.window.emit('pagehide');assert.equal(f.audio.voices.size,0);f.window.emit('pageshow',{persisted:true});assert.deepEqual(events.observe(s),empty);
});

test('overlapping low-priority actions are dropped; terminal cue replaces rather than layers voices',async()=>{
  const f=setup();await f.audio.unlock();assert.equal(f.audio.play('capture'),true);const first=[...f.context.sources];
  assert.equal(f.audio.play('take'),false);assert.equal(f.context.sources.length,first.length);
  assert.equal(f.audio.play('win'),true);assert.ok(first.every(s=>s.stops.includes(undefined)&&!s.connected));assert.ok(f.audio.voices.size<=5);
  const ticket=f.audio.ticket({kind:'reserve',key:'too-late'});f.advance(2500);assert.equal(f.audio.playTicket(ticket),false,'old feedback cannot surprise the user after a long pause');
});

test('friends use a quieter envelope and synthetic texture does not consume Math.random',async()=>{
  const own=setup(),remote=setup();await own.audio.unlock();await remote.audio.unlock();const random=Math.random;
  try{Math.random=()=>{throw Error('game randomness consumed');};assert.equal(own.audio.play('take'),true);assert.equal(remote.audio.play('take',{quiet:true}),true);}finally{Math.random=random;}
  assert.ok(remote.context.gains[1].values[1][0]<own.context.gains[1].values[1][0]);assert.equal(own.context.sources.length,remote.context.sources.length);
  assert.deepEqual(own.audio.noise.getChannelData(0),remote.audio.noise.getChannelData(0));
});

test('storage denial, unavailable audio and rejected resumes never block game flow',async()=>{
  const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
  const unavailable=new SplendorAudio({storage:denied,contextFactory(){throw Error('no audio');}});
  assert.equal(await unavailable.unlock(),false);assert.doesNotThrow(()=>unavailable.setEnabled(false));assert.doesNotThrow(()=>unavailable.setEnabled(true));assert.equal(unavailable.play('take'),false);
  const context=new Context();context.state='suspended';context.resume=()=>Promise.reject(Error('blocked'));
  const f=setup({context});assert.equal(await f.audio.unlock(),false);assert.equal(f.audio.ticket({kind:'capture'}),null);assert.equal(f.context.sources.length,0);
});

test('muting while AudioContext resume is pending cannot release old sounds afterward',async()=>{
  const context=new Context();context.state='suspended';let resume;
  context.resume=()=>new Promise(resolve=>{resume=()=>{context.state='running';resolve();};});
  const f=setup({context}),unlock=f.audio.unlock();assert.equal(f.audio.ticket({kind:'take'}),null);
  f.audio.setEnabled(false);resume();assert.equal(await unlock,false);assert.equal(f.context.sources.length,0);assert.equal(f.audio.play('take'),false);
});

test('storage events update the button and stop voices without echo writes; unbind removes listeners',async()=>{
  const f=setup(),unbind=bindSplendorAudio(f.audio,f.button,f);await f.audio.unlock();f.audio.play('evolve');
  f.window.emit('storage',{key:SOUND_KEY,newValue:'false'});assert.equal(f.audio.enabled,false);assert.equal(f.button.getAttribute('aria-pressed'),'false');assert.equal(f.audio.voices.size,0);assert.equal(f.storage.getItem(SOUND_KEY),null);
  unbind();assert.equal(f.context.state,'closed');assert.ok([...f.document.listeners.values()].every(set=>set.size===0));
});
