import {handlePoker} from '../../games/texas-holdem/server/api.mjs';
export default {
 async fetch(request,env){
  if(new URL(request.url).pathname.startsWith('/api/poker/'))return handlePoker(request,env.DB);
  if(new URL(request.url).pathname==='/health')return Response.json({ok:true,service:'open-tabletop',version:'0.1.0'});
  return env.ASSETS.fetch(request);
 }
};
