import {InkWarRoomService,InkWarRoomError,hashToken} from './rooms.mjs';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const buckets=new Map();
function burstLimit(request){
  const now=Date.now(),window=Math.floor(now/1000),key=hashToken((request.headers.get('cf-connecting-ip')||'local')+':'+(request.headers.get('authorization')||'anonymous'));
  for(const [id,bucket]of buckets)if(bucket.window<window-1)buckets.delete(id);
  const bucket=buckets.get(key);
  if(bucket?.window===window){if(++bucket.count>60)throw new InkWarRoomError(429,'操作太频繁，请稍后再试。');}
  else buckets.set(key,{window,count:1});
}
async function readBody(request){
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new InkWarRoomError(415,'请求必须使用 JSON。');
  const reader=request.body?.getReader();if(!reader)throw new InkWarRoomError(400,'请求内容缺失。');
  let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new InkWarRoomError(413,'请求内容过大。');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}
  catch{throw new InkWarRoomError(400,'请求内容不是有效 JSON。');}
}

export async function handleInkWar(request,_db,options={}){
  try{
    if(!options.store)throw new InkWarRoomError(503,'联机房间存储尚未配置。');
    const url=new URL(request.url),path=url.pathname.replace(/^\/api\/ink-war/,'');
    if((request.headers.get('origin')&&request.headers.get('origin')!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')throw new InkWarRoomError(403,'不允许跨站操作。');
    burstLimit(request);
    if(path==='/health'&&request.method==='GET')return json({ok:true,service:'ink-war-online',version:1});
    const service=new InkWarRoomService(options.store,options.clock);
    if(path==='/rooms'&&request.method==='POST'){if(options.limit)await options.limit(request);return json(await service.create(await readBody(request)),201);}
    const match=path.match(/^\/rooms\/([A-Z2-9]{6})(?:\/(join|ready|configure|start|action|leave|rematch))?$/);
    if(!match)throw new InkWarRoomError(404,'接口不存在。');
    const operation=match[2]||'state';
    if((operation==='state'&&request.method!=='GET')||(operation!=='state'&&request.method!=='POST'))throw new InkWarRoomError(405,'请求方法不正确。');
    if(operation==='join'&&options.limit)await options.limit(request);
    const key=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
    return json(await service.request(match[1],key,operation,operation==='state'?{}:await readBody(request)));
  }catch(error){
    if(error instanceof InkWarRoomError)return json({error:error.message},error.status);
    console.error('Ink war service failure',error?.name||'Error');return json({error:'联机房间暂时无法响应，请稍后重连。'},503);
  }
}
