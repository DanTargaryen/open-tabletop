import {handlePoker} from '../../games/texas-holdem/server/api.mjs';
export default {
 async fetch(request,env){
  if(new URL(request.url).pathname.startsWith('/api/splendor/'))return Response.json({error:'璀璨宝石联机目前需要 Node 服务；此 Worker 仅支持扑克联机。'},{status:503});
  if(new URL(request.url).pathname.startsWith('/api/poker/'))return handlePoker(request,env.DB);
  if(new URL(request.url).pathname==='/health')return Response.json({ok:true,service:'open-tabletop',version:'0.1.0'});
  return env.ASSETS.fetch(request);
 }
};
