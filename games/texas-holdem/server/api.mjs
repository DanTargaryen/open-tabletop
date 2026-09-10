import {RoomService,RoomError,hashToken} from './rooms.mjs';

export class D1RoomStore{
 constructor(db){this.db=db;}
 async get(code,now){const row=await this.db.prepare('SELECT revision,payload,expires_at FROM poker_rooms WHERE code=? AND expires_at>?').bind(code,now).first();return row?{revision:row.revision,room:JSON.parse(row.payload),expiresAt:row.expires_at}:null;}
 async create(code,room,expiresAt){const r=await this.db.prepare('INSERT OR IGNORE INTO poker_rooms(code,revision,payload,expires_at) VALUES(?,0,?,?)').bind(code,JSON.stringify(room),expiresAt).run();return r.meta.changes===1;}
 async cas(code,revision,room,expiresAt){const r=await this.db.prepare('UPDATE poker_rooms SET revision=revision+1,payload=?,expires_at=? WHERE code=? AND revision=?').bind(JSON.stringify(room),expiresAt,code,revision).run();return r.meta.changes===1;}
}
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
async function readBody(request){
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new RoomError(415,'请求必须使用 JSON。');
 const reader=request.body?.getReader();if(!reader)throw new RoomError(400,'请求内容缺失。');
 let size=0;const chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new RoomError(413,'请求内容过大。');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
 try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||Array.isArray(value)||typeof value!=='object')throw Error();return value;}catch{throw new RoomError(400,'请求内容不是有效 JSON。');}
}
async function rateLimit(db,request){
 const now=Date.now(),bucket=Math.floor(now/60000),ip=request.headers.get('cf-connecting-ip')||'local';
 const key=await hashToken(ip+':'+bucket);
 const row=await db.prepare('INSERT INTO poker_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+120000).first();
 if(row.count>40)throw new RoomError(429,'操作太频繁，请稍后再试。');
 if(row.count===1)await db.batch([db.prepare('DELETE FROM poker_limits WHERE expires_at<?').bind(now),db.prepare('DELETE FROM poker_rooms WHERE expires_at<?').bind(now)]);
}
export async function handlePoker(request,db,options={}){
 try{
  if(!db&&!options.store)return json({error:'联机服务尚未完成配置。'},503);
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\/poker/,'');
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)throw new RoomError(403,'不允许跨站操作。');
  const service=new RoomService(options.store||new D1RoomStore(db));
  const limit=()=>options.limit?options.limit(request):rateLimit(db,request);
  if(path==='/health'&&request.method==='GET'){if(db)await db.prepare('SELECT 1 FROM poker_rooms LIMIT 1').first();return json({ok:true,service:'velvet-poker-online',version:1});}
  if(path==='/rooms'&&request.method==='POST'){await limit();return json(await service.create(await readBody(request)),201);}
  const match=path.match(/^\/rooms\/([A-Z2-9]{6})(?:\/(join|action|ready|start|leave|new-round|kick))?$/);
  if(!match)throw new RoomError(404,'接口不存在。');
  const operation=match[2]||'state';
  if((operation==='state'&&request.method!=='GET')||(operation!=='state'&&request.method!=='POST'))throw new RoomError(405,'请求方法不正确。');
  if(operation==='join')await limit();
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
  const input=operation==='state'?{}:await readBody(request);
  if(operation==='state'&&url.searchParams.get('sync')==='2')input._sync={protocol:2,scope:(url.searchParams.get('scope')||'').slice(0,100),history:(url.searchParams.get('history')||'').slice(0,100),version:Number(url.searchParams.get('version')??-1)};
  return json(await service.request(match[1],token,operation,input));
 }catch(error){
  if(error instanceof RoomError)return json({error:error.message},error.status);
  console.error('Poker service failure',error?.name||'Error');
  return json({error:'牌局服务暂时不可用，请稍后重连。'},503);
 }
}
