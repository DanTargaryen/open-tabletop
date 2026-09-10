import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createTabletopServer} from '../server/index.mjs';
import worker from '../deploy/cloudflare/worker.mjs';

test('all three Node API adapters preserve rate-limit errors after integration', async t => {
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
  for (const game of ['poker', 'splendor', 'abracada']) {
    const response = await fetch(`${base}/api/${game}/rooms`, {method:'POST', body:'{}'});
    assert.equal(response.status, 429, game);
    assert.match((await response.json()).error, /频繁/);
  }
});

test('configured Cloudflare migrations support independent rooms for all three games', async t => {
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
  for (const game of ['poker', 'splendor', 'abracada']) {
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
  }
  for (const game of ['poker', 'splendor', 'abracada']) {
    assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM ${game}_rooms`).get().n, 1, game);
  }
});
