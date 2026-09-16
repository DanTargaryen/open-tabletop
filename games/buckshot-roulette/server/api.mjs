import {BuckshotRooms,BuckshotError,hashToken} from './rooms.mjs';

export class D1BuckshotRoomStore{
  constructor(db){this.db=db;}
  async get(code,now){const row=await this.db.prepare('SELECT revision,payload,expires_at FROM buckshot_rooms WHERE code=? AND expires_at>?').bind(code,now).first();return row?{revision:row.revision,room:JSON.parse(row.payload),expiresAt:row.expires_at}:null;}
  async create(code,room,expiresAt){const result=await this.db.prepare('INSERT OR IGNORE INTO buckshot_rooms(code,revision,payload,expires_at) VALUES(?,0,?,?)').bind(code,JSON.stringify(room),expiresAt).run();return result.meta.changes===1;}
  async cas(code,revision,room,expiresAt){const result=await this.db.prepare('UPDATE buckshot_rooms SET revision=revision+1,payload=?,expires_at=? WHERE code=? AND revision=?').bind(JSON.stringify(room),expiresAt,code,revision).run();return result.meta.changes===1;}
  async health(){
    await this.db.prepare('SELECT 1 FROM buckshot_rooms LIMIT 1').first();
    await this.db.prepare('SELECT 1 FROM buckshot_limits LIMIT 1').first();
  }
}

const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});

async function readBody(request){
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new BuckshotError(415,'请求必须为 JSON。');
  const reader=request.body?.getReader();if(!reader)throw new BuckshotError(400,'请求内容缺失。');
  let text='',size=0;const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();throw new BuckshotError(413,'请求内容过大。');}text+=decoder.decode(value,{stream:true});}
  try{const value=JSON.parse(text+decoder.decode());if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}
  catch{throw new BuckshotError(400,'请求不是有效 JSON。');}
}

async function rateLimit(db,request){
  const now=Date.now(),bucket=Math.floor(now/60000),ip=request.headers.get('cf-connecting-ip')||'local';
  const key=await hashToken(`${ip}:${bucket}`);
  const row=await db.prepare('INSERT INTO buckshot_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+120000).first();
  if(row.count>40)throw new BuckshotError(429,'操作太频繁，请稍后再试。');
  if(row.count===1)await db.batch([
    db.prepare('DELETE FROM buckshot_limits WHERE expires_at<?').bind(now),
    db.prepare('DELETE FROM buckshot_rooms WHERE expires_at<=?').bind(now),
  ]);
}

export async function handleBuckshot(request,db,options={}){
  try{
    const url=new URL(request.url),path=url.pathname.replace(/^\/api\/buckshot/,'');
    if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)throw new BuckshotError(403,'不允许跨站操作。');
    const store=options.store||(db?new D1BuckshotRoomStore(db):null);
    if(!store)return json({error:'暗膛协议联机服务尚未完成配置。'},503);
    if(path==='/health'&&request.method==='GET'){await store.health?.();if(db&&!store.health)await db.prepare('SELECT 1 FROM buckshot_rooms LIMIT 1').first();return json({ok:true,service:'buckshot-online',schema:1});}
    const rooms=new BuckshotRooms(store);
    const limit=()=>options.limit?options.limit(request):rateLimit(db,request);
    if(path==='/rooms'&&request.method==='POST'){await limit();return json(await rooms.create(await readBody(request)),201);}
    const match=path.match(/^\/rooms\/([A-Z2-9]{6})(?:\/(join|ready|start|action|leave|rematch))?$/);
    if(!match)throw new BuckshotError(404,'接口不存在。');
    const op=match[2]||'state';
    if(request.method!==(op==='state'?'GET':'POST'))throw new BuckshotError(405,'请求方法不正确。');
    if(op==='join')await limit();
    const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
    return json(await rooms.request(match[1],token,op,op==='state'?{}:await readBody(request)));
  }catch(error){
    if(Number.isInteger(error.status))return json({error:error.message},error.status);
    console.error('Buckshot service failure',error?.name||'Error');
    return json({error:'牌桌暂时无法同步，请稍后重试。'},503);
  }
}
