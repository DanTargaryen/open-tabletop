import {hashToken,InkWarRoomError} from './rooms.mjs';

export class D1InkWarRoomStore{
  constructor(db){this.db=db;}
  async get(code,now){
    const row=await this.db.prepare('SELECT revision,payload,expires_at FROM ink_war_rooms WHERE code=? AND expires_at>?').bind(code,now).first();
    return row?{revision:row.revision,room:JSON.parse(row.payload),expiresAt:row.expires_at}:null;
  }
  async create(code,room,expiresAt){
    const result=await this.db.prepare('INSERT OR IGNORE INTO ink_war_rooms(code,revision,payload,expires_at) VALUES(?,0,?,?)').bind(code,JSON.stringify(room),expiresAt).run();
    return result.meta.changes===1;
  }
  async cas(code,revision,room,expiresAt){
    const result=await this.db.prepare('UPDATE ink_war_rooms SET revision=revision+1,payload=?,expires_at=? WHERE code=? AND revision=?').bind(JSON.stringify(room),expiresAt,code,revision).run();
    return result.meta.changes===1;
  }
}

// Reuse the store within a Worker so its room queue serializes local requests.
// Revision checks remain authoritative across independent Workers.
const stores=new WeakMap();
export function inkWarD1Store(db){
  if(!stores.has(db))stores.set(db,new D1InkWarRoomStore(db));
  return stores.get(db);
}

export async function limitInkWarRoomEntry(db,request){
  const now=Date.now(),bucket=Math.floor(now/60000),ip=request.headers.get('cf-connecting-ip')||'local';
  const key=hashToken(`${ip}:${bucket}`);
  const row=await db.prepare('INSERT INTO ink_war_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+120000).first();
  if(row.count>40)throw new InkWarRoomError(429,'操作太频繁，请稍后再试。');
  if(row.count===1)await db.batch([
    db.prepare('DELETE FROM ink_war_limits WHERE expires_at<?').bind(now),
    db.prepare('DELETE FROM ink_war_rooms WHERE expires_at<?').bind(now),
  ]);
}
