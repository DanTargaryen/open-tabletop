import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {MemoryRoomStore} from '../games/texas-holdem/server/rooms.mjs';

// One Node process owns this file. Use the D1 adapter for a distributed deployment.
export class FileRoomStore extends MemoryRoomStore {
 constructor(path){super();this.path=path;this.pending=Promise.resolve();}
 async init(){
  await mkdir(dirname(this.path),{recursive:true,mode:0o700});
  try{this.rows=new Map(JSON.parse(await readFile(this.path,'utf8')).filter(([,v])=>v.expiresAt>Date.now()));}
  catch(error){if(error.code!=='ENOENT')throw error;}
  return this;
 }
 async save(){
  const task=this.pending.then(async()=>{
   for(const[code,row]of this.rows)if(row.expiresAt<=Date.now())this.rows.delete(code);
   const temporary=this.path+'.tmp';
   await writeFile(temporary,JSON.stringify([...this.rows]),{mode:0o600});
   await rename(temporary,this.path);
  });
  this.pending=task.catch(()=>{});return task;
 }
 async create(...args){const changed=await super.create(...args);if(changed)await this.save();return changed;}
 async cas(...args){const changed=await super.cas(...args);if(changed)await this.save();return changed;}
 async close(){await this.pending;}
}
