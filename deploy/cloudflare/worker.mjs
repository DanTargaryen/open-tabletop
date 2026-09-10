import {handlePoker} from '../../games/texas-holdem/server/api.mjs';
import {handleAbracada} from '../../games/abracada-what/server/api.mjs';
import {handleSplendorD1} from '../../games/splendor/server/d1-store.mjs';
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/api/splendor/'))return handleSplendorD1(request,env.DB);
  if(path.startsWith('/api/poker/'))return handlePoker(request,env.DB);
  if(path.startsWith('/api/abracada/'))return handleAbracada(request,env.DB);
  if(path==='/health')return Response.json({ok:true,service:'open-tabletop',version:'0.1.0'});
  return env.ASSETS.fetch(request);
 }
};
