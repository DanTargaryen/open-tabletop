import {createServer} from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {networkInterfaces} from 'node:os';
import {Readable} from 'node:stream';
import {handlePoker} from '../games/texas-holdem/server/api.mjs';
import {RoomError} from '../games/texas-holdem/server/rooms.mjs';
import {FileRoomStore} from './room-store.mjs';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json; charset=utf-8'};
const safeHeaders={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};

export async function createTabletopServer({dataDir=resolve(projectRoot,'.data'),publicOrigin=null}={}){
 if(publicOrigin){const parsed=new URL(publicOrigin);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw Error('PUBLIC_ORIGIN must be an http(s) origin');publicOrigin=parsed.origin;}
 const store=await new FileRoomStore(resolve(dataDir,'poker-rooms.json')).init();
 const catalog=JSON.parse(await readFile(resolve(projectRoot,'games/catalog.json'),'utf8'));
 const limits=new Map();
 const limit=request=>{
  const now=Date.now(),bucket=Math.floor(now/60000),key=(request.headers.get('cf-connecting-ip')||'local')+':'+bucket;
  for(const[k,value]of limits)if(value.bucket<bucket)limits.delete(k);
  const count=(limits.get(key)?.count||0)+1;limits.set(key,{bucket,count});
  if(count>40)throw new RoomError(429,'操作太频繁，请稍后再试。');
 };
 const server=createServer(async(req,res)=>{
  try{
   if(!req.url?.startsWith('/')||req.url.startsWith('//')){res.writeHead(400);res.end();return;}
   const url=new URL(req.url,publicOrigin||'http://'+req.headers.host);
   if(url.pathname.startsWith('/api/poker/')){
    const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
    // Untrusted forwarded IPs cannot evade the local create/join limiter.
    headers.set('cf-connecting-ip',req.socket.remoteAddress||'local');
    const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
    const response=await handlePoker(request,null,{store,limit});res.writeHead(response.status,{...safeHeaders,...Object.fromEntries(response.headers)});res.end(Buffer.from(await response.arrayBuffer()));return;
   }
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
   if(url.pathname==='/health'||url.pathname==='/games.json'){
    const body=JSON.stringify(url.pathname==='/health'?{ok:true,service:'open-tabletop',version:'0.1.0'}:catalog);
    res.writeHead(200,{...safeHeaders,'Content-Type':mime['.json'],'Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:body);return;
   }
   let path=decodeURIComponent(url.pathname);
   if(path.includes('\\')||path.includes('\0')||path.split('/').some(part=>part.startsWith('.'))){res.writeHead(404);res.end();return;}
   const prefix='/games/texas-holdem/';
   if(path==='/games/texas-holdem'){res.writeHead(302,{Location:prefix+url.search});res.end();return;}
   const staticRoot=path.startsWith(prefix)?resolve(projectRoot,'games/texas-holdem/web'):resolve(projectRoot,'public');
   path=path.startsWith(prefix)?path.slice(prefix.length):path.slice(1);
   if(!path)path='index.html';
   if(!extname(path))path+='.html';
   const file=await realpath(resolve(staticRoot,path));
   if(!file.startsWith(staticRoot+sep)||!mime[extname(file)]||!(await stat(file)).isFile()){res.writeHead(404);res.end();return;}
   const bytes=await readFile(file);res.writeHead(200,{...safeHeaders,'Content-Type':mime[extname(file)],'Content-Length':bytes.length,'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){
   if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:500,safeHeaders);
   res.end('Resource unavailable');
  }
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 return {server,store,catalog,async close(){await new Promise((done,fail)=>server.close(error=>error?fail(error):done()));await store.close();}};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),option=(name,fallback)=>{const index=args.indexOf(name);if(index<0)return fallback;if(!args[index+1]||args[index+1].startsWith('--'))throw Error('Missing value for '+name);return args[index+1];};
 if(args.includes('--help')){console.log('Open Tabletop\nnode server/index.mjs [--host 127.0.0.1] [--port 18772] [--data-dir .data] [--origin https://example.com]');}
 else{
  const host=option('--host','127.0.0.1'),port=Number(option('--port',process.env.PORT||'18772'));
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Port must be between 1024 and 65535');
  const app=await createTabletopServer({dataDir:resolve(option('--data-dir',process.env.DATA_DIR||resolve(projectRoot,'.data'))),publicOrigin:option('--origin',process.env.PUBLIC_ORIGIN||null)});
  app.server.listen(port,host,()=>{console.log(`Open Tabletop · 开桌\nhttp://127.0.0.1:${port}/`);if(host==='0.0.0.0')for(const list of Object.values(networkInterfaces()))for(const address of list||[])if(address.family==='IPv4'&&!address.internal)console.log(`LAN: http://${address.address}:${port}/`);});
  app.server.on('error',error=>{console.error(error.message);process.exitCode=1;});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0),()=>process.exit(1)));
 }
}
