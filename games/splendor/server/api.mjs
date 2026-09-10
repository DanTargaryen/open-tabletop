import {SplendorRooms,SplendorError} from './rooms.mjs';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
async function readBody(request) {
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new SplendorError(415,'请求必须为 JSON。');
  const reader=request.body?.getReader(); if(!reader) throw new SplendorError(400,'请求内容缺失。');
  let text='',size=0; const decoder=new TextDecoder();
  while(true) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();throw new SplendorError(413,'请求内容过大。');}text+=decoder.decode(value,{stream:true});}
  try {const value=JSON.parse(text+decoder.decode());if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;} catch {throw new SplendorError(400,'请求不是有效 JSON。');}
}
export async function handleSplendor(request,{store,limit=()=>{}}={}) {
  try {
    const url=new URL(request.url),path=url.pathname.replace(/^\/api\/splendor/,'');
    if(request.headers.get('origin') && request.headers.get('origin')!==url.origin) throw new SplendorError(403,'不允许跨站操作。');
    if(!store) return json({error:'璀璨宝石联机服务尚未完成配置。'},503);
    if(path==='/health' && request.method==='GET') {await store.health?.();return json({ok:true,service:'splendor-pokemon',schema:1});}
    const rooms=new SplendorRooms(store);
    if(path==='/rooms' && request.method==='POST') {await limit(request);return json(await rooms.create(await readBody(request)),201);}
    const match=path.match(/^\/rooms\/([A-Z2-9]{6})(?:\/(join|ready|start|action|leave|rematch))?$/);
    if(!match) throw new SplendorError(404,'接口不存在。');
    const op=match[2]||'state';
    if(request.method!==(op==='state'?'GET':'POST')) throw new SplendorError(405,'请求方法不正确。');
    if(op==='join') await limit(request);
    const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
    return json(await rooms.request(match[1],token,op,op==='state'?{}:await readBody(request)));
  } catch(error) {
    if(Number.isInteger(error.status)) return json({error:error.message},error.status);
    console.error('Splendor service failure',error?.name||'Error');
    return json({error:'牌桌暂时无法同步，请稍后重试。'},503);
  }
}
