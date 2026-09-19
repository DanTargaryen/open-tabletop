import {DATA} from './data.js';

export const CHARACTERS=DATA.characters;
export const CHECKPOINTS=[9,17,25,33,41,49];
export const ITEMS={shield:{name:'应援券',price:3,description:'取消一次负面效果'},reroll:{name:'重掷券',price:2,description:'移动前重掷，接受新点数'},bento:{name:'便当盒',price:2,description:'恢复 1 心情'},ticket:{name:'接驳车票',price:2,description:'本次移动 +2，或抵消交通减速'},pass:{name:'通行证',price:2,description:'抵消送错地点的回退'},luck:{name:'幸运挂件',price:2,description:'本次行动的下一次骰子检定 +1，最高 6'}};
export const SKILLS={railgun:'电气开路：解除自己的减速，每局一次。',april:'即兴乐句：移动前免费重掷一次，接受新点数。',kaguya:'周密准备：获得一张应援券，每局一次。',toradora:'不服输：一次后退 2–4 格改为后退 1 格。',violet:'把心意送达：领取一封委托信，到下一休息点获得 3 零花钱。',chuni:'结界指引：移动前将骰点反转为 7 减去原点数，每局一次。'};
const EVENT=new Map(DATA.events.map(e=>[e.id,e]));
export const clone=x=>structuredClone(x);
export function random(){return crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;}
const die=rng=>Math.min(6,Math.max(1,Math.floor(rng()*6)+1));
const check=(ok,message)=>{if(!ok)throw Error(message);};
const fx=(op,to,n,extra={})=>({op,to,n,...extra});
const coin=(to,n)=>fx('coin',to,n);
const heal=(to,n)=>fx('heal',to,n);
const walk=(to,n)=>fx('move',to,n,{harm:n<0});
const gift=(to,item)=>fx('item',to,0,{item});
const option=(id,label,effects,cost=0)=>({id,label,effects,cost});

export function createGame({players,first,mode='solo'}={},rng=random){
 const specs=players??CHARACTERS.slice(0,4).map((c,i)=>({character:c.id,name:c.name,isBot:i!==0}));
 check(Array.isArray(specs)&&specs.length>=2&&specs.length<=4,'请选择 2–4 个座位。');
 check(new Set(specs.map(p=>p.character)).size===specs.length,'每个角色只能被选择一次。');
 const list=specs.map((p,id)=>{const c=CHARACTERS.find(c=>c.id===p.character);check(c,'角色不存在。');return {id,character:c.id,name:String(p.name||c.name).slice(0,16),isBot:!!p.isBot,pos:0,checkpoint:0,hp:3,coins:3,bag:['shield'],skillUsed:false,slow:0,boost:0,fixed:false,guardUntil:0,turns:0,letter:null};});
 const turn=first??Math.floor(rng()*list.length);check(Number.isInteger(turn)&&turn>=0&&turn<list.length,'先手无效。');
 const s={schema:1,mode,players:list,turn,startSeat:turn,turnCount:0,round:1,phase:'turn',die:0,dieSource:null,inverted:false,rerolled:false,activeUsed:false,luck:0,queue:[],resume:'ack',pending:null,event:null,log:[],seq:0,moves:[],winners:[],actionNumber:0};
 log(s,`${list[turn].name} 先出发。目的地：第 60 格闭幕舞台。`);return s;
}
function log(s,text){s.log.push({id:++s.seq,text});s.log=s.log.slice(-60);}
function prompt(s,kind,actor,title,options,extra={}){s.phase='event';s.pending={kind,actor,title,options,...extra};}
export function actorId(s){return s.pending?.actor??s.turn;}
export function steps(s){const p=s.players[s.turn];return Math.max(1,(s.inverted?7-s.die:s.die)+p.boost-p.slow);}
function moved(s,p,to,kind='walk'){
 const from=p.pos;p.pos=Math.max(0,Math.min(60,to));
 if(p.pos>from&&kind==='walk')for(const cp of CHECKPOINTS)if(cp>from&&cp<=p.pos&&cp>p.checkpoint){p.checkpoint=cp;p.hp=Math.min(3,p.hp+1);log(s,`${p.name} 在 ${cp} 格签到，心情 +1。`);}
 if((kind==='jump'||kind==='swap')&&CHECKPOINTS.includes(p.pos)&&p.pos>p.checkpoint){p.checkpoint=p.pos;p.hp=Math.min(3,p.hp+1);}
 if(p.letter&&kind==='walk'&&from<p.letter&&p.pos>=p.letter){p.coins+=3;p.letter=null;log(s,`${p.name} 送达委托信，零花钱 +3。`);}
 s.moves.push({id:++s.seq,player:p.id,from,to:p.pos,kind});s.moves=s.moves.slice(-16);
 log(s,`${p.name} ${p.pos>=from?'前进':'返回'}到 ${p.pos} 格。`);
}
function finishIfNeeded(s){
 const arrived=s.players.filter(p=>p.pos>=60&&p.hp>0);
 if(arrived.length){s.winners=arrived.map(p=>p.id);s.phase='finished';s.pending=null;s.queue=[];log(s,`${arrived.map(p=>p.name).join('、')} 抵达闭幕舞台！`);return true;}
 return false;
}
function gainItem(s,p,item){
 check(ITEMS[item],'道具不存在。');
 if(p.bag.length<3){p.bag.push(item);log(s,`${p.name} 获得${ITEMS[item].name}。`);return;}
 prompt(s,'bag',p.id,'背包已满：选择替换一件，或放弃新道具。',p.bag.map((x,i)=>({id:String(i),label:`用${ITEMS[item].name}替换${ITEMS[x].name}`})).concat({id:'skip',label:'放弃新道具'}),{item});
}
function startQueue(s,effects,rng,resume='ack'){s.queue.push(...effects);s.resume=resume;runQueue(s,rng);}
function rollCheck(s,rng){const n=die(rng),value=Math.min(6,n+s.luck);if(s.luck)log(s,`幸运挂件生效：${n} → ${value}。`);s.luck=0;log(s,`事件检定：${value} 点。`);return value;}
function defenseOptions(s,e){
 const p=s.players[e.to],opts=[];
 if(p.bag.includes('shield'))opts.push({id:'shield',label:'使用应援券 · 取消本次负面效果'});
 if(e.cancelWith&&p.bag.includes(e.cancelWith))opts.push({id:e.cancelWith,label:`使用${ITEMS[e.cancelWith].name}`});
 if(e.op==='move'&&e.n<=-2&&e.n>=-4&&p.character==='toradora'&&!p.skillUsed)opts.push({id:'skill',label:'不服输 · 改为只后退 1 格'});
 return opts;
}
function runQueue(s,rng){
 for(let safety=0;s.queue.length;safety++){
  check(safety<120,'事件链过长。');const e=s.queue.shift(),p=s.players[e.to??s.turn];
  if(e.op==='slow'&&p.guardUntil>p.turns){p.guardUntil=0;log(s,`${p.name} 的路线提醒抵消了减速。`);continue;}
  if(e.harm&&!e.accepted){
   const opts=defenseOptions(s,e);
   if(opts.length){prompt(s,'defense',p.id,'可以抵消这次处罚。',opts.concat({id:'accept',label:'接受结果'}),{effect:e});return;}
  }
  switch(e.op){
   case 'harmBundle':s.queue.unshift(...e.effects);break;
   case 'coin':p.coins=Math.max(0,p.coins+e.n);if(e.n)log(s,`${p.name} 零花钱 ${e.n>0?'+':''}${e.n}。`);break;
   case 'heal':p.hp=Math.max(0,Math.min(3,p.hp+e.n));log(s,`${p.name} 心情 ${e.n>0?'+':''}${e.n}。`);if(!p.hp){moved(s,p,p.checkpoint,'jump');p.hp=3;p.coins=Math.max(0,p.coins-2);s.queue=[];log(s,`${p.name} 回休息点恢复，损失至多 2 零花钱。`);}break;
   case 'move':moved(s,p,p.pos+e.n);break;
   case 'home':moved(s,p,p.checkpoint,'jump');break;
   case 'slow':p.slow=Math.max(p.slow,e.n);log(s,`${p.name} 下次移动减少 ${e.n} 步。`);break;
   case 'boost':p.boost=Math.max(p.boost,e.n);log(s,`${p.name} 下次移动增加 ${e.n} 步。`);break;
   case 'fixed':p.fixed=true;log(s,`${p.name} 下次可选择固定走 4 格。`);break;
   case 'guard':p.guardUntil=p.turns+3;log(s,`${p.name} 获得一次减速保护。`);break;
   case 'clean':p.slow=0;log(s,`${p.name} 清除了减速。`);break;
   case 'letter':p.letter=CHECKPOINTS.find(n=>n>p.pos)??60;log(s,`${p.name} 领取委托信，目标 ${p.letter} 格。`);break;
   case 'item':gainItem(s,p,e.item);if(s.pending)return;break;
   case 'check':{const d=rollCheck(s,rng);s.queue.unshift(...(d>=e.threshold?e.yes:e.no));break;}
   case 'parity':prompt(s,'parity',p.id,'预言骰点：奇数还是偶数？',[{id:'odd',label:'奇数 · 1 / 3 / 5'},{id:'even',label:'偶数 · 2 / 4 / 6'}],{yes:e.yes,no:e.no});return;
   case 'choose':prompt(s,'effects',p.id,e.title,e.options.filter(o=>p.coins>=(o.cost||0)));return;
   case 'target':{const targets=s.players.filter(q=>q.id!==p.id&&(e.distance===undefined||Math.abs(q.pos-p.pos)<=e.distance));if(!targets.length){s.queue.unshift(coin(p.id,1));break;}prompt(s,'target',p.id,e.title,targets.map(q=>({id:String(q.id),label:q.name})),{operation:e.operation});return;}
   case 'invite':prompt(s,'inviteTarget',p.id,'邀请一位同伴参加活动。',s.players.filter(q=>q.id!==p.id).map(q=>({id:String(q.id),label:`邀请 ${q.name}`})).concat({id:'skip',label:'不邀请 · 领取保底'}),{owner:p.id,eventId:e.eventId});return;
   case 'swap':{const other=s.players[e.other],a=p.pos,b=other.pos;moved(s,p,b,'swap');moved(s,other,a,'swap');break;}
   case 'memory':prompt(s,'memoryOffer',p.id,'记住四个符号，或选择掷骰猜奇偶。',[{id:'memory',label:'开始记忆挑战'},{id:'guess',label:'改为猜奇偶'}]);return;
   case 'proof':{const a=Array.from({length:4},()=>1+Math.floor(rng()*4)),index=Math.floor(rng()*4),b=[...a];b[index]=b[index]%4+1;prompt(s,'proof',p.id,'找出两行中不同的位置。',[0,1,2,3].map(i=>({id:String(i),label:`第 ${i+1} 位`})),{lines:[a,b],answer:index});return;}
   case 'shop':prompt(s,'shop',p.id,'选购一件道具，或领取 1 零花钱离开。',Object.entries(ITEMS).filter(([,v])=>v.price<=p.coins).map(([id,v])=>({id,label:`${v.name} · ${v.price} 零花钱`})).concat({id:'skip',label:'离开 · 零花钱 +1'}));return;
   case 'gift':{const pool=Object.keys(ITEMS),items=[pool[Math.floor(rng()*pool.length)],pool[Math.floor(rng()*pool.length)]];prompt(s,'giftKeep',p.id,'选择保留的一件；另一件送给同伴。',items.map((x,i)=>({id:String(i),label:ITEMS[x].name})),{items});return;}
   default:throw Error(`不支持的事件效果 ${e.op}`);
  }
 }
 s.pending=null;if(s.resume==='ack'&&finishIfNeeded(s))return;s.phase=s.resume;
}

export function eventEffects(id,s){
 const i=s.turn,p=s.players[i],choose=(title,options)=>[fx('choose',i,0,{title,options})],o=(id,label,effects,cost=0)=>option(id,label,effects,cost),invite=()=>[fx('invite',i,0,{eventId:id})],pay=n=>coin(i,-n),restore=n=>heal(i,n),money=n=>coin(i,n),move=n=>walk(i,n),item=x=>gift(i,x),slow=n=>fx('slow',i,n,{harm:true}),target=(title,operation,distance)=>fx('target',i,0,{title,operation,distance});
 switch(id){
  case 'R01':return choose('取回饮料，还是继续走？',[o('buy','付 1 · 恢复 1 心情',[pay(1),restore(1)],1),o('back','放弃 · 后退 1 格',[move(-1)])]);
  case 'R02':return choose('选择近路或补给。',[o('go','前进 3 格',[move(3)]),o('coin','零花钱 +1',[money(1)])]);
  case 'R05':return choose('是否请人接班？',[o('work','帮忙 · 零花钱 +2',[money(2)]),o('pay','付 1 · 前进 2 格',[pay(1),move(2)],1)]);
  case 'R07':return [fx('harmBundle',i,0,{harm:true,effects:[heal(i,-1),fx('slow',i,1)]}),money(1)];
  case 'R09':case 'A03':case 'K01':case 'K10':case 'T09':case 'C09':case 'X13':return invite();
  case 'R10':case 'A02':return [move(-2)];
  case 'R12':return [fx('home',i,0,{harm:true}),item('reroll')];
  case 'A04':return choose('鼓励自己，再出发。',[o('heal','恢复 1 心情',[restore(1)]),o('reroll','获得重掷券',[item('reroll')])]);
  case 'A08':case 'C07':return [fx('memory',i)];
  case 'A10':return choose('是否购买午后咖啡？',[o('buy','付 1 · 恢复 2 心情',[pay(1),restore(2)],1),o('skip','离开',[])]);
  case 'A11':case 'V11':return [money(2),...(p.hp===1?[restore(1)]:[])];
  case 'A12':return [fx('fixed',i)];
  case 'K02':return choose('接受哪一份安排？',[o('go','前进 2 格',[move(2)]),o('shield','获得应援券',[item('shield')])]);
  case 'K04':return [fx('parity',i,0,{yes:[money(2)],no:[]})];
  case 'K05':return [fx('guard',i)];
  case 'K09':return choose('是否使用文化祭预算？',[o('pay','付 2 · 抽两件道具并分享',[pay(2),fx('gift',i)],2),o('skip','离开',[])]);
  case 'K12':return [target('选择距离 4 格内的同伴换位。','swap',4)];
  case 'T01':return [restore(1),fx('clean',i)];
  case 'T03':return [fx('move',i,-3,{harm:true,cancelWith:'pass'})];
  case 'T04':return [fx('boost',i,1),target('为一位同伴应援。','boost')];
  case 'T07':case 'V03':case 'C06':{const cost=id==='T07'?2:1,back=id==='V03'?1:2;return choose('花钱解决，还是返回处理？',[o('pay',`付 ${cost} 零花钱`,[pay(cost)],cost),o('back',`后退 ${back} 格`,[move(-back)])]);}
  case 'T10':return [fx('shop',i)];
  case 'T11':return [fx('home',i,0,{harm:true}),restore(3)];
  case 'V01':return choose('选一句想要写下的话。',[o('thanks','谢谢你一直以来的陪伴。',[money(2)]),o('hope','期待下次一起参加校园祭。',[money(2)])]);
  case 'V02':return [fx('letter',i)];
  case 'V04':return [fx('proof',i)];
  case 'V05':return [...(p.letter?[money(1)]:[]),move(3)];
  case 'V12':return choose('赶上末班车，或按原路线前进。',[o('pay','付 2 · 前进 4 格',[pay(2),move(4)],2),o('walk','前进 1 格',[move(1)])]);
  case 'C01':case 'X15':return choose('配合仪式，还是稳稳走一步？',[o('risk','掷骰 · 4–6 前进 3 格',[fx('check',i,0,{threshold:4,yes:[move(3)],no:id==='X15'?[money(1)]:[]})]),o('safe','稳定前进 1 格',[move(1)])]);
  case 'C02':return choose('选择路线或整理状态。',[o('go','前进 2 格',[move(2)]),o('clean','清除减速',[fx('clean',i)])]);
  case 'C03':return [fx('parity',i,0,{yes:[fx('boost',i,2)],no:[money(1)]})];
  case 'C12':return choose('解除结界，继续前进。',[o('go','前进 3 格',[move(3)]),o('coin','零花钱 +2',[money(2)])]);
  case 'X01':return [money(1),item('shield')];
  case 'X11':return [fx('harmBundle',i,0,{harm:true,cancelWith:'ticket',effects:[heal(i,-1),fx('slow',i,1)]})];
  case 'X12':return [move(2)];
  case 'X14':return choose('穿过结界，或帮忙整理。',[o('go','前进 2 格',[move(2)]),o('heal','恢复 1 心情',[restore(1)])]);
  case 'X16':return [item(p.letter?'ticket':'bento')];
  case 'X17':return [restore(1),target('把感谢送给一位同伴。','coin')];
  case 'X18':return [...s.players.map(q=>coin(q.id,1)),move(1)];
  default:throw Error(`事件 ${id} 尚未实现。`);
 }
}
export const IMPLEMENTED_EVENTS=DATA.events.map(e=>e.id);
export function startEncounter(game,id,rng=random){const s=clone(game);check(EVENT.has(id),'事件不存在。');s.event=clone(EVENT.get(id));s.pending=null;s.queue=[];log(s,`${s.players[s.turn].name}：${s.event.name}`);startQueue(s,eventEffects(id,s),rng);return s;}
function fallback(id,owner){return id==='A03'?[heal(owner,1)]:[coin(owner,1)];}
function resolveInvite(s,p,rng){
 const a=p.owner,b=p.guest,id=p.eventId;
 if(['K01','C09','X13'].includes(id)){
  const labels=id==='C09'?['太阳','月亮']:id==='K01'?['邀请','观望']:['感谢','邀请'];
  prompt(s,'simultaneous',a,'双方分别选择，提交后才会一起揭示。',labels.map((label,i)=>({id:String(i),label})),{owner:a,guest:b,eventId:id,selections:{}});return;
 }
 if(id==='T09'){
  if(s.players[a].coins<1||s.players[b].coins<1){log(s,'有同伴零花钱不足，改领保底。');s.queue.unshift(...fallback(id,a));}else s.queue.unshift(coin(a,-1),coin(b,-1),walk(a,3),walk(b,3));
 }else{
  const d1=rollCheck(s,rng),d2=die(rng);log(s,`${s.players[a].name} ${d1} 点，${s.players[b].name} ${d2} 点。`);
  if(id==='K10')s.queue.unshift(...(d1===d2?[coin(a,1),coin(b,1)]:[coin(d1>d2?a:b,2)]));
  else if(d1+d2>=7)s.queue.unshift(...(id==='R09'?[walk(a,2),walk(b,2)]:[coin(a,2),coin(b,2)]));
  else s.queue.unshift(...(id==='R09'?[coin(a,1),coin(b,1)]:[heal(a,1),heal(b,1)]));
 }
 runQueue(s,rng);
}
function choose(s,value,rng){
 const p=s.pending;check(p,'当前没有待处理的选择。');const o=p.options.find(o=>o.id===String(value));check(o,'请选择可用选项。');const actor=s.players[p.actor];s.pending=null;
 switch(p.kind){
  case 'effects':check(actor.coins>=(o.cost||0),'零花钱不足。');s.queue.unshift(...o.effects);break;
  case 'defense':if(o.id==='accept')s.queue.unshift({...p.effect,accepted:true});else if(o.id==='skill'){actor.skillUsed=true;s.queue.unshift({...p.effect,n:-1,accepted:true});}else{actor.bag.splice(actor.bag.indexOf(o.id),1);log(s,`${actor.name} 使用${ITEMS[o.id].name}，取消了处罚。`);}break;
  case 'bag':if(o.id!=='skip'){actor.bag[Number(o.id)]=p.item;log(s,`${actor.name} 将新道具放进背包。`);}break;
  case 'target':{const target=Number(o.id);if(p.operation==='swap')s.queue.unshift(fx('swap',target,0,{other:actor.id,harm:true}));else if(p.operation==='boost')s.queue.unshift(fx('boost',target,1));else if(p.operation==='coin')s.queue.unshift(coin(target,1));break;}
  case 'inviteTarget':if(o.id==='skip')s.queue.unshift(...fallback(p.eventId,p.owner));else {const guest=Number(o.id);prompt(s,'inviteConsent',guest,`${s.players[p.owner].name} 邀请你参加「${s.event.name}」。`,[{id:'yes',label:'接受邀请'},{id:'no',label:'婉拒'}],{owner:p.owner,guest,eventId:p.eventId});return;}break;
  case 'inviteConsent':if(o.id==='no'){s.queue.unshift(...fallback(p.eventId,p.owner));break;}resolveInvite(s,p,rng);return;
  case 'simultaneous':{
   p.selections[p.actor]=Number(o.id);
   if(p.selections[p.guest]===undefined){p.actor=p.guest;s.pending=p;s.phase='event';return;}
   const a=p.owner,b=p.guest,x=p.selections[a],y=p.selections[b];log(s,`同时揭示：${s.players[a].name}「${p.options[x].label}」，${s.players[b].name}「${p.options[y].label}」。`);
   if(p.eventId==='K01')s.queue.unshift(...(x===0&&y===0?[walk(a,1),walk(b,1)]:x===1&&y===1?[coin(a,1),coin(b,1)]:[coin(x===0?a:b,2)]));
   else if(p.eventId==='C09')s.queue.unshift(...(x===y?[walk(a,2),walk(b,2)]:[coin(a,1),coin(b,1)]));
   else s.queue.unshift(coin(a,x===y?2:1),coin(b,x===y?2:1));break;
  }
  case 'parity':{const d=rollCheck(s,rng);s.queue.unshift(...((d%2===1)===(o.id==='odd')?p.yes:p.no));break;}
  case 'memoryOffer':if(o.id==='guess'){s.queue.unshift(fx('parity',actor.id,0,{yes:[coin(actor.id,2)],no:[]}));break;}prompt(s,'memoryShow',actor.id,'记住这四个符号；准备好后再作答。',[{id:'ready',label:'记住了 · 开始作答'}],{sequence:Array.from({length:4},()=>1+Math.floor(rng()*4))});return;
  case 'memoryShow':prompt(s,'memoryAnswer',actor.id,'依次输入刚才的四个符号。',[{id:'answer',label:'提交答案'},{id:'skip',label:'跳过 · 无奖励'}],{sequence:p.sequence});return;
  case 'proof':if(Number(o.id)===p.answer)s.queue.unshift(coin(actor.id,2));else log(s,'这次没找对，继续旅程。');break;
  case 'shop':if(o.id==='skip')s.queue.unshift(coin(actor.id,1));else {check(actor.coins>=ITEMS[o.id].price,'零花钱不足。');s.queue.unshift(coin(actor.id,-ITEMS[o.id].price),gift(actor.id,o.id));}break;
  case 'giftKeep':{const keep=p.items[Number(o.id)],send=p.items[1-Number(o.id)];s.queue.unshift(gift(actor.id,keep));prompt(s,'giftRecipient',actor.id,`把${ITEMS[send].name}送给谁？`,s.players.filter(q=>q.id!==actor.id).map(q=>({id:String(q.id),label:q.name})),{item:send});return;}
  case 'giftRecipient':s.queue.push(gift(Number(o.id),p.item));break;
  default:throw Error('选择状态无效。');
 }
 runQueue(s,rng);
}
export function legalActions(s,actor=actorId(s)){
 if(s.phase==='finished'||actor!==actorId(s))return [];
 const p=s.players[actor];
 if(s.pending)return s.pending.options.map(o=>({type:'choose',value:o.id,label:o.label}));
 if(s.phase==='ack')return [{type:'next',label:'结束回合'}];
 const a=[];
 if(s.phase==='turn'){
  a.push({type:'roll',label:'掷骰出发'});if(p.fixed)a.push({type:'fixed',label:'使用排练记录 · 固定走 4 格'});
  if(!s.activeUsed){for(const item of [...new Set(p.bag)])if(['bento','ticket','luck'].includes(item)&&(item!=='bento'||p.hp<3))a.push({type:'item',item,label:`使用${ITEMS[item].name}`});
   if(!p.skillUsed&&(['kaguya','violet'].includes(p.character)||(p.character==='railgun'&&p.slow)))a.push({type:'skill',label:'使用角色技能'});}
 }else if(s.phase==='move'){
  a.push({type:'move',label:`前进 ${steps(s)} 格`});
  if(!s.rerolled&&s.dieSource==='dice'&&p.bag.includes('reroll'))a.push({type:'item',item:'reroll',label:'使用重掷券'});
  if(!s.activeUsed&&!p.skillUsed&&s.dieSource==='dice'&&['april','chuni'].includes(p.character)&&!(p.character==='april'&&s.rerolled))a.push({type:'skill',label:p.character==='april'?'即兴乐句 · 重掷一次':`结界指引 · ${s.die} → ${7-s.die}`});
 }
 return a;
}
export function step(game,actor,action,rng=random){
 const allowed=legalActions(game,actor);check(allowed.some(a=>a.type===action.type&&(a.value===undefined||a.value===String(action.value))&&(a.item===undefined||a.item===action.item)),'现在不能执行这个动作。');
 const s=clone(game),p=s.players[actor];s.actionNumber++;
 if(action.type==='choose'){
  if(s.pending.kind==='memoryAnswer'){
   check(action.value==='skip'||Array.isArray(action.answer)&&action.answer.length===4&&action.answer.every(n=>Number.isInteger(n)&&n>=1&&n<=4),'请输入四个符号。');
   if(action.value==='answer'&&JSON.stringify(action.answer)===JSON.stringify(s.pending.sequence))s.queue.unshift(coin(actor,2));
   else log(s,'这次没有完成记忆挑战，继续旅程。');s.pending=null;runQueue(s,rng);
  }else choose(s,action.value,rng);
 }else if(action.type==='roll'||action.type==='fixed'){
  s.die=action.type==='fixed'?4:die(rng);s.dieSource=action.type==='fixed'?'fixed':'dice';s.phase='move';log(s,`${p.name} ${s.dieSource==='fixed'?'选择固定':'掷出'} ${s.die} 点。`);
 }else if(action.type==='move'){
  moved(s,p,p.pos+steps(s));p.slow=0;p.boost=0;p.fixed=false;
  if(finishIfNeeded(s))return s;
  const tile=DATA.map[p.pos-1];if(tile.event==='safe'||tile.event==='rest'){s.phase='ack';s.event={id:tile.event,name:tile.name,scene:'休息片刻，继续校园祭。',rule:tile.rule};}
  else return startEncounter(s,tile.event,rng);
 }else if(action.type==='item'){
  p.bag.splice(p.bag.indexOf(action.item),1);log(s,`${p.name} 使用${ITEMS[action.item].name}。`);
  if(action.item==='reroll'){s.die=die(rng);s.rerolled=true;s.inverted=false;log(s,`重新掷出 ${s.die} 点，接受新结果。`);}else{s.activeUsed=true;if(action.item==='bento')p.hp=Math.min(3,p.hp+1);if(action.item==='ticket')p.boost=Math.max(p.boost,2);if(action.item==='luck')s.luck=1;}
 }else if(action.type==='skill'){
  p.skillUsed=true;s.activeUsed=true;log(s,`${p.name} 发动角色技能。`);
  if(p.character==='railgun')p.slow=0;
  if(p.character==='april'){s.die=die(rng);s.rerolled=true;log(s,`即兴乐句：${s.die} 点。`);}
  if(p.character==='chuni')s.inverted=!s.inverted;
  if(p.character==='kaguya')startQueue(s,[gift(actor,'shield')],rng,'turn');
  if(p.character==='violet')startQueue(s,[fx('letter',actor)],rng,'turn');
 }else if(action.type==='next'){
  p.turns++;s.turnCount++;s.round=Math.floor(s.turnCount/s.players.length)+1;
  if(s.turnCount>=s.players.length*30){const sorted=[...s.players].sort((a,b)=>b.pos-a.pos||b.hp-a.hp||b.coins-a.coins),best=sorted[0];s.winners=sorted.filter(q=>q.pos===best.pos&&q.hp===best.hp&&q.coins===best.coins).map(q=>q.id);s.phase='finished';log(s,'校园祭闭幕：按位置、心情、零花钱结算。');}
  else{s.turn=(s.turn+1)%s.players.length;s.phase='turn';s.pending=null;s.queue=[];s.event=null;s.die=0;s.dieSource=null;s.inverted=false;s.rerolled=false;s.activeUsed=false;s.luck=0;}
 }
 return s;
}

export function projectGame(game,viewer){
 const s=clone(game),p=s.pending;
 if(p?.sequence&&p.kind==='memoryAnswer')delete p.sequence;
 if(p?.sequence&&p.actor!==viewer)delete p.sequence;
 if(p?.answer!==undefined)delete p.answer;
 if(p?.selections)p.selections=Object.hasOwn(p.selections,viewer)?{[viewer]:p.selections[viewer]}:{};
 return s;
}
export function botAction(view,rng=random){
 const actor=actorId(view),p=view.players[actor],actions=legalActions(view,actor),pending=view.pending;
 check(actions.length,'没有合法动作。');
 if(pending){
  if(pending.kind==='memoryOffer')return actions.find(a=>a.value==='guess');
  if(pending.kind==='memoryAnswer')return actions.find(a=>a.value==='skip');
  if(pending.kind==='proof'){const [a,b]=pending.lines;return actions.find(o=>o.value===String(a.findIndex((n,i)=>n!==b[i])));}
  if(pending.kind==='defense'){const e=pending.effect,big=e.op==='home'||e.op==='swap'||e.op==='harmBundle'||e.op==='move'&&e.n<=-2||e.op==='slow'&&e.n>=2;return actions.find(a=>a.value==='skill')??actions.find(a=>a.value==='ticket')??actions.find(a=>big&&a.value==='shield')??actions.at(-1);}
  if(['inviteTarget','target','giftRecipient'].includes(pending.kind)){const choices=actions.filter(a=>a.value!=='skip');return choices[Math.floor(rng()*choices.length)]??actions.at(-1);}
  if(pending.kind==='inviteConsent')return actions.find(a=>a.value==='yes');
  if(pending.kind==='shop')return actions.find(a=>a.value===(p.hp<3?'bento':!p.bag.includes('shield')?'shield':'ticket'))??actions.at(-1);
  if(pending.kind==='bag')return actions.find(a=>a.value===String(p.bag.findIndex(x=>x==='pass'||x==='luck')))??actions.at(-1);
  if(pending.kind==='parity'||pending.kind==='simultaneous')return actions[Math.floor(rng()*actions.length)];
  if(pending.kind==='effects'){
   const score=o=>(o.effects??[]).reduce((n,e)=>n+(e.op==='move'?e.n*1.3:e.op==='coin'?e.n*.6:e.op==='heal'?Math.min(e.n,3-p.hp)*2:e.op==='item'?1.8:e.op==='clean'?p.slow:e.op==='check'?1.5:0),0);
   return actions.reduce((a,b)=>score(pending.options.find(o=>o.id===b.value))>score(pending.options.find(o=>o.id===a.value))?b:a);
  }
  return actions[0];
 }
 if(view.phase==='turn')return actions.find(a=>a.type==='item'&&a.item==='bento'&&p.hp<3)??actions.find(a=>a.type==='skill')??actions.find(a=>a.type==='item'&&a.item==='ticket')??actions.find(a=>a.type==='fixed')??actions[0];
 if(view.phase==='move'){if(view.die<=2)return actions.find(a=>a.type==='skill')??actions.find(a=>a.type==='item')??actions[0];return actions[0];}
 return actions[0];
}
export function validSavedGame(s){
 try{return s?.schema===1&&Array.isArray(s.players)&&s.players.length>=2&&s.players.length<=4&&new Set(s.players.map(p=>p.character)).size===s.players.length&&s.players.every((p,i)=>p.id===i&&CHARACTERS.some(c=>c.id===p.character)&&Number.isInteger(p.pos)&&p.pos>=0&&p.pos<=60&&Number.isInteger(p.hp)&&p.hp>=1&&p.hp<=3&&Number.isInteger(p.coins)&&p.coins>=0&&Array.isArray(p.bag)&&p.bag.length<=3&&p.bag.every(x=>ITEMS[x])&&[p.slow,p.boost].every(n=>Number.isInteger(n)&&n>=0&&n<=6)&&Number.isInteger(p.turns)&&p.turns>=0&&p.turns<=30&&[0,...CHECKPOINTS].includes(p.checkpoint)&&typeof p.skillUsed==='boolean'&&typeof p.fixed==='boolean'&&(p.letter===null||[...CHECKPOINTS,60].includes(p.letter)))&&Number.isInteger(s.turn)&&s.turn>=0&&s.turn<s.players.length&&['turn','move','event','ack','finished'].includes(s.phase)&&Array.isArray(s.queue)&&Array.isArray(s.log)&&Array.isArray(s.moves)&&Number.isInteger(s.actionNumber)&&(s.phase!=='event'||s.pending&&Number.isInteger(s.pending.actor)&&s.players[s.pending.actor]&&Array.isArray(s.pending.options)&&s.pending.options.length>0&&s.pending.options.length<=12)&&Number.isInteger(s.turnCount)&&s.turnCount>=0&&s.turnCount<=120&&Array.isArray(s.winners)&&s.winners.every(i=>Number.isInteger(i)&&i>=0&&i<s.players.length)&&(s.phase!=='finished'||s.winners.length>0);}catch{return false;}
}
