import {AbracadaRoomError,AbracadaRoomService,hashToken} from './rooms.mjs';

export class D1AbracadaRoomStore{
  constructor(db){this.db=db;}
  async get(code,now){const row=await this.db.prepare('SELECT revision,payload,expires_at FROM abracada_rooms WHERE code=? AND expires_at>?').bind(code,now).first();return row?{revision:row.revision,room:JSON.parse(row.payload),expiresAt:row.expires_at}:null;}
  async create(code,room,expiresAt){const result=await this.db.prepare('INSERT OR IGNORE INTO abracada_rooms(code,revision,payload,expires_at) VALUES(?,0,?,?)').bind(code,JSON.stringify(room),expiresAt).run();return result.meta.changes===1;}
  async cas(code,revision,room,expiresAt){const result=await this.db.prepare('UPDATE abracada_rooms SET revision=revision+1,payload=?,expires_at=? WHERE code=? AND revision=?').bind(JSON.stringify(room),expiresAt,code,revision).run();return result.meta.changes===1;}
}

const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});

async function readBody(request){
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new AbracadaRoomError(415,'请求必须使用 JSON。');
  const reader=request.body?.getReader();
  if(!reader)throw new AbracadaRoomError(400,'请求内容缺失。');
  let size=0;
  const chunks=[];
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    size+=value.byteLength;
    if(size>8192){await reader.cancel();throw new AbracadaRoomError(413,'请求内容过大。');}
    chunks.push(value);
  }
  const bytes=new Uint8Array(size);
  let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{
    const value=JSON.parse(new TextDecoder().decode(bytes));
    if(!value||Array.isArray(value)||typeof value!=='object')throw Error();
    return value;
  }catch{
    throw new AbracadaRoomError(400,'请求内容不是有效 JSON。');
  }
}

async function rateLimit(db,request){
  const now=Date.now();
  const bucket=Math.floor(now/60000);
  const ip=request.headers.get('cf-connecting-ip')||'local';
  const key=await hashToken(`${ip}:${bucket}`);
  const row=await db.prepare('INSERT INTO abracada_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+120000).first();
  if(row.count>40)throw new AbracadaRoomError(429,'操作太频繁，请稍后再试。');
  if(row.count===1)await db.batch([db.prepare('DELETE FROM abracada_limits WHERE expires_at<?').bind(now),db.prepare('DELETE FROM abracada_rooms WHERE expires_at<?').bind(now)]);
}

export async function handleAbracada(request,db,options={}){
  try{
    if(!db&&!options.store)return json({error:'联机服务尚未完成配置。'},503);
    const url=new URL(request.url);
    const path=url.pathname.replace(/^\/api\/abracada/,'');
    if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)throw new AbracadaRoomError(403,'不允许跨站操作。');
    const service=new AbracadaRoomService(options.store||new D1AbracadaRoomStore(db));
    const limit=()=>options.limit?options.limit(request):rateLimit(db,request);
    if(path==='/health'&&request.method==='GET'){
      if(db)await db.prepare('SELECT 1 FROM abracada_rooms LIMIT 1').first();
      return json({ok:true,service:'abracada-online',version:1});
    }
    if(path==='/rooms'&&request.method==='POST'){
      await limit();
      return json(await service.create(await readBody(request)),201);
    }
    const match=path.match(/^\/rooms\/([A-Z2-9]{6})(?:\/(join|action|ready|seat|start|leave|kick))?$/);
    if(!match)throw new AbracadaRoomError(404,'接口不存在。');
    const operation=match[2]||'state';
    if((operation==='state'&&request.method!=='GET')||(operation!=='state'&&request.method!=='POST'))throw new AbracadaRoomError(405,'请求方法不正确。');
    if(operation==='join')await limit();
    const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
    const input=operation==='state'?{}:await readBody(request);
    return json(await service.request(match[1],token,operation,input));
  }catch(error){
    if(error instanceof AbracadaRoomError)return json({error:error.message},error.status);
    console.error('Abracada service failure',error?.name||'Error');
    return json({error:'法师塔暂时无法响应，请稍后重连。'},503);
  }
}
