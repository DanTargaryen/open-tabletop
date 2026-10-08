import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createTabletopServer} from '../server/index.mjs';
import worker from '../deploy/cloudflare/worker.mjs';

test('all nine Node API adapters preserve rate-limit errors after integration', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'tabletop-three-games-'));
  const app = await createTabletopServer({dataDir});
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); await rm(dataDir, {recursive:true, force:true}); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  // Pin the bucket so a minute boundary cannot reset the limiter during the test.
  const now = Date.now();
  t.mock.method(Date, 'now', () => now);
  for (let index = 0; index < 40; index++) {
    const response = await fetch(base + '/api/poker/rooms', {method:'POST', body:'{}'});
    assert.equal(response.status, 415);
    await response.text();
  }
  for (const game of ['poker', 'splendor', 'abracada', 'aeroplane', 'buckshot', 'steel-arc', 'anime-campus', 'monopoly', 'ink-war']) {
    const response = await fetch(`${base}/api/${game}/rooms`, {method:'POST', body:'{}'});
    assert.equal(response.status, 429, game);
    assert.match((await response.json()).error, /频繁/);
  }
});

test('configured Cloudflare migrations support independent rooms for all nine games', async t => {
  const configUrl = new URL('../deploy/cloudflare/wrangler.example.jsonc', import.meta.url);
  const config = JSON.parse(await readFile(configUrl, 'utf8'));
  const migrationDir = new URL(config.d1_databases[0].migrations_dir + '/', configUrl);
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  for (const file of (await readdir(migrationDir)).filter(file => file.endsWith('.sql')).sort()) {
    sql.exec(await readFile(new URL(file, migrationDir), 'utf8'));
  }
  const db = {
    prepare(query) {
      const statement = sql.prepare(query);
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() { return statement.get(...params) || null; },
        async run() { return {meta:{changes:statement.run(...params).changes}}; },
      };
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); },
  };
  for (const game of ['poker', 'splendor', 'abracada', 'aeroplane', 'buckshot', 'steel-arc', 'anime-campus', 'monopoly', 'ink-war']) {
    const base = `https://tabletop.example/api/${game}`;
    assert.equal((await worker.fetch(new Request(base + '/health'), {DB:db})).status, 200, game);
    const created = await worker.fetch(new Request(base + '/rooms', {
      method:'POST',
      headers:{'Content-Type':'application/json', Origin:'https://tabletop.example'},
      body:JSON.stringify({name:'Host', seatKey:randomBytes(24).toString('hex'), capacity:2, playerCount:2, ...(game === 'abracada' ? {mode:'score'} : {})}),
    }), {DB:db});
    assert.equal(created.status, 201, game);
    const host = await created.json();
    const restored = await worker.fetch(new Request(base + '/rooms/' + host.room.code, {
      headers:{Authorization:'Bearer ' + host.token},
    }), {DB:db});
    assert.equal(restored.status, 200, game);
    assert.equal((await restored.json()).room.code, host.room.code);
    assert.equal((await worker.fetch(new Request(base + '/rooms/' + host.room.code), {DB:db})).status, 403);
    if(game==='monopoly'){
      const headers={'Content-Type':'application/json',Authorization:'Bearer '+host.token};
      const started=await worker.fetch(new Request(base+'/rooms/'+host.room.code+'/start',{method:'POST',headers,body:'{}'}),{DB:db});
      assert.equal(started.status,200);const state=await started.json();
      const rolled=await worker.fetch(new Request(base+'/rooms/'+host.room.code+'/action',{method:'POST',headers,body:JSON.stringify({type:'roll',moneyScale:10,rulesVersion:5,dice:[99,99],version:state.room.version,requestId:'worker_monopoly_roll'})}),{DB:db});
      assert.equal(rolled.status,200);const view=await rolled.json();assert.ok(view.game.dice.every(d=>d>=1&&d<=6));assert.equal(view.game.decks,undefined);
    }
  }
  for (const game of ['poker', 'splendor', 'abracada', 'aeroplane', 'buckshot', 'steel-arc', 'anime-campus', 'monopoly', 'ink-war']) {
    const table=game==='ink-war'?'ink_war_rooms':game==='anime-campus'?'anime_campus_rooms':game==='steel-arc'?'steel_arc_rooms':`${game}_rooms`;
    assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 1, game);
  }
});
