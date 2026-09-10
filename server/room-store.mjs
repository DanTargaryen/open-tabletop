import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';

const clone=value=>JSON.parse(JSON.stringify(value));

export class FileRoomStore {
 constructor(path){this.rows=new Map();this.path=path;this.pending=Promise.resolve();}
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
 async get(code,now){const value=this.rows.get(code);return value&&value.expiresAt>now?clone(value):null;}
 async create(code,room,expiresAt){if(this.rows.has(code))return false;this.rows.set(code,{revision:0,room:clone(room),expiresAt});await this.save();return true;}
 async cas(code,revision,room,expiresAt){const previous=this.rows.get(code);if(!previous||previous.revision!==revision)return false;this.rows.set(code,{revision:revision+1,room:clone(room),expiresAt});await this.save();return true;}
 async close(){await this.pending;}
}
