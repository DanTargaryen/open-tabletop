import {handleSplendor} from './api.mjs';
import {hashToken,SplendorError} from './rooms.mjs';

// Dedicated tables keep Pokémon rooms and their rate limits separate from poker.
export class D1SplendorRoomStore {
  constructor(db) {this.db=db;}
  async get(code,now) {
    const row=await this.db.prepare('SELECT revision,payload,expires_at FROM splendor_rooms WHERE code=? AND expires_at>?').bind(code,now).first();
    return row?{revision:row.revision,room:JSON.parse(row.payload),expiresAt:row.expires_at}:null;
  }
  async create(code,room,expiresAt) {
    const result=await this.db.prepare('INSERT OR IGNORE INTO splendor_rooms(code,revision,payload,expires_at) VALUES(?,0,?,?)').bind(code,JSON.stringify(room),expiresAt).run();
    return result.meta.changes===1;
  }
  async cas(code,revision,room,expiresAt) {
    const result=await this.db.prepare('UPDATE splendor_rooms SET revision=revision+1,payload=?,expires_at=? WHERE code=? AND revision=?').bind(JSON.stringify(room),expiresAt,code,revision).run();
    return result.meta.changes===1;
  }
  async health() {
    await this.db.prepare('SELECT 1 FROM splendor_rooms LIMIT 1').first();
    await this.db.prepare('SELECT 1 FROM splendor_limits LIMIT 1').first();
  }
}

export async function limitSplendorRequests(db,request,now=Date.now()) {
  const bucket=Math.floor(now/60000),ip=request.headers.get('cf-connecting-ip')||'local';
  const key=await hashToken(ip+':'+bucket);
  const row=await db.prepare('INSERT INTO splendor_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+120000).first();
  if(row.count>40)throw new SplendorError(429,'操作太频繁，请稍后再试。');
  if(row.count===1)await db.batch([
    db.prepare('DELETE FROM splendor_limits WHERE expires_at<?').bind(now),
    db.prepare('DELETE FROM splendor_rooms WHERE expires_at<=?').bind(now)
  ]);
}

export function handleSplendorD1(request,db) {
  return handleSplendor(request,{store:db?new D1SplendorRoomStore(db):null,limit:r=>limitSplendorRequests(db,r)});
}
