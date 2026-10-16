import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fixture } from './helpers.mjs';
import { openStore } from '../server/store.mjs';
import { setTimeout } from 'node:timers/promises';
test('import, auth, FSRS, undo, duplicate protection, editing and device sessions survive restart', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cardrove-api-')),
    file = await fixture(dir),
    port = 19400 + Math.floor(Math.random() * 500),
    base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server/index.mjs', '--api-only'], {
      cwd: path.resolve(import.meta.dirname, '..'),
      env: { ...process.env, CARDROVE_DATA_DIR: dir, PORT: String(port), HOST: '127.0.0.1', CARDROVE_SETUP_CODE:'test-first-owner-code' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    child.stderr.on('data', (b) => (logs += b));
    for (let i = 0; i < 120; i++) {
      try {
        if ((await fetch(base + '/api/session')).ok) return;
      } catch {}
      if (child.exitCode !== null) throw Error(logs);
      await setTimeout(100);
    }
    throw Error('Server failed to start: ' + logs);
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    await new Promise((resolve) => {
      child.once('exit', resolve);
      child.kill('SIGTERM');
    });
  }
  async function call(endpoint, { method = 'GET', body, cookie = '', origin } = {}) {
    const response = await fetch(base + '/api' + endpoint, {
      method,
      headers: {
        'X-Cardrove': '1',
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(origin ? { Origin: origin } : {}),
      },
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  try {
    await start();
    assert.equal((await call('/summary')).status, 401);
    assert.equal((await call('/session')).data.setup, true);
    const owner = await call('/auth', {
      method: 'POST',
      body: { name: 'owner', password: 'test-password-123', setupCode:'test-first-owner-code' },
    });
    assert.equal(owner.status, 200);
    const cookie = owner.cookie;
    assert.equal(
      (await call('/auth', { method: 'POST', body: { name: 'owner', password: 'wrong-password' } }))
        .status,
      401,
    );
    assert.equal(
      (
        await call('/settings', {
          method: 'PATCH',
          cookie,
          origin: 'https://evil.example',
          body: {},
        })
      ).status,
      403,
    );
    const body = new FormData();
    body.append('deck', new Blob([await readFile(file)]), 'test.apkg');
    let imported = await call('/import', { method: 'POST', body, cookie });
    assert.equal(imported.status, 200, JSON.stringify(imported.data));
    assert.equal(imported.data.cards, 3);
    const duplicateBody = new FormData();
    duplicateBody.append('deck', new Blob([await readFile(file)]), 'test.apkg');
    assert.equal(
      (await call('/import', { method: 'POST', body: duplicateBody, cookie })).data.duplicate,
      true,
    );
    const device2 = await call('/auth', {
        method: 'POST',
        body: { name: 'owner', password: 'test-password-123' },
      }),
      cookie2 = device2.cookie;
    assert.notEqual(cookie, cookie2);
    assert.equal(
      (
        await call('/settings', {
          method: 'PATCH',
          cookie,
          body: { dailyNew: 1, goal: 20, timezone: 'Asia/Jakarta' },
        })
      ).status,
      200,
    );
    const first = (await call('/next', { cookie })).data.card;
    assert.ok(first);
    const review = await call('/review', {
      method: 'POST',
      cookie,
      body: { id: first.id, version: first.version, rating: 3, elapsed: 7000 },
    });
    assert.equal(review.status, 200);
    const stale = await call('/review', {
      method: 'POST',
      cookie: cookie2,
      body: { id: first.id, version: first.version, rating: 4 },
    });
    assert.equal(stale.status, 409);
    let stats = (await call('/summary', { cookie: cookie2 })).data;
    assert.equal(stats.today.count, 1);
    assert.equal(stats.today.introduced, 1);
    assert.equal((await call('/next', { cookie })).data.card, null);
    assert.equal(
      (await call('/undo', { method: 'POST', cookie, body: { reviewId: review.data.reviewId } }))
        .status,
      200,
    );
    stats = (await call('/summary', { cookie })).data;
    assert.equal(stats.today.count, 0);
    assert.equal(stats.today.introduced, 0);
    const reverted = (await call('/next', { cookie })).data.card;
    assert.equal(reverted.id, first.id);
    assert.ok(reverted.version > first.version);
    assert.equal(
      (
        await call('/review', {
          method: 'POST',
          cookie: cookie2,
          body: { id: first.id, version: first.version, rating: 4 },
        })
      ).status,
      409,
    );
    const reviewed = await call('/review', {
      method: 'POST',
      cookie,
      body: { id: reverted.id, version: reverted.version, rating: 1, elapsed: 5000 },
    });
    assert.equal(reviewed.status, 200);
    assert.equal((await call('/summary', { cookie })).data.today.introduced, 1);
    // Due learning cards remain available even after the new-card limit is reached.
    const local = openStore(dir);
    local.prepare('UPDATE progress SET due=? WHERE card_id=?').run(Date.now() - 1000, first.id);
    local.close();
    assert.equal((await call('/next', { cookie })).data.card.id, first.id);
    assert.equal(
      (
        await call('/settings', {
          method: 'PATCH',
          cookie,
          body: { dailyNew: 20, goal: 20, timezone: 'Asia/Jakarta' },
        })
      ).status,
      200,
    );
    const list = await call('/cards?q=' + encodeURIComponent('学ぶ'), { cookie });
    assert.equal(list.data.total, 2);
    const edit = list.data.cards[0];
    const fields = [...edit.fields];
    fields[1] = 'mempelajari';
    const saved = await call('/notes/' + edit.note_id, {
      method: 'PATCH',
      cookie,
      body: { fields, modified: edit.modified },
    });
    assert.equal(saved.status, 200);
    assert.equal(
      (
        await call('/notes/' + edit.note_id, {
          method: 'PATCH',
          cookie: cookie2,
          body: { fields, modified: edit.modified },
        })
      ).status,
      409,
    );
    assert.equal((await call('/card/' + edit.id, { cookie })).data.fields[1], 'mempelajari');
    const media = await fetch(
      base + '/api/media/' + encodeURIComponent(first.model.mediaPrefix + ':sample.mp3'),
      { headers: { Cookie: cookie } },
    );
    assert.equal(media.status, 200);
    assert.equal(await media.text(), 'test-media');
    assert.equal(
      (
        await fetch(
          base + '/api/media/' + encodeURIComponent(first.model.mediaPrefix + ':sample.mp3'),
        )
      ).status,
      401,
    );
    const backup = await call('/export', { cookie });
    assert.equal(backup.data.format, 'Cardrove');
    assert.equal(backup.data.progress.length, 1);
    await stop();
    await start();
    assert.equal((await call('/summary', { cookie: cookie2 })).data.today.count, 1);
    assert.equal((await call('/card/' + edit.id, { cookie })).data.fields[1], 'mempelajari');
    await call('/logout', { method: 'POST', cookie });
    assert.equal((await call('/summary', { cookie })).status, 401);
    assert.equal((await call('/summary', { cookie: cookie2 })).status, 200);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
