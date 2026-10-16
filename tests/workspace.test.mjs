import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';
import { fixture } from './helpers.mjs';

test('owner setup, persistent access rotation, workspace rename and confirmed progress reset', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cardrove-workspace-'));
  const port = 20200 + Math.floor(Math.random() * 500),
    base = `http://127.0.0.1:${port}/api`;
  const child = spawn(process.execPath, ['server/index.mjs', '--api-only'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      CARDROVE_DATA_DIR: dir,
      PORT: String(port),
      HOST: '127.0.0.1',
      CARDROVE_SETUP_CODE: 'a'.repeat(64),
    },
    stdio: 'ignore',
  });
  const call = async (route, body, cookie = '', method = body ? 'POST' : 'GET') => {
    const r = await fetch(base + route, {
      method,
      headers: {
        'X-Cardrove': '1',
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get('set-cookie')?.split(';')[0],
    };
  };
  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await call('/session')).status === 200) break;
      } catch {}
      await setTimeout(50);
    }
    assert.equal((await call('/auth', { password: 'b'.repeat(64) })).status, 403);
    const initial = await call('/auth', { password: 'a'.repeat(64) });
    assert.equal(initial.status, 200);
    const cookie = initial.cookie;
    assert.equal(initial.data.needsOnboarding, true);
    assert.equal(
      (await call('/workspace/setup', { name: 'Owner', workspaceName: 'My library' })).status,
      401,
    );
    const setup = await call(
      '/workspace/setup',
      { name: 'Owner', workspaceName: 'My library' },
      cookie,
    );
    assert.equal(setup.status, 200);
    const oldCode = setup.data.token;
    assert.match(oldCode, /^[a-f0-9]{64}$/);
    assert.equal((await call('/workspace/confirm-access', { token: 'wrong' }, cookie)).status, 409);
    assert.equal((await call('/workspace/confirm-access', { token: oldCode }, cookie)).status, 200);
    assert.equal((await call('/session', null, cookie)).data.user.needsOnboarding, false);
    const second = await call('/auth', { password: oldCode });
    assert.equal(second.status, 200);
    assert.equal(
      (
        await call(
          '/workspace',
          { name: 'Renamed owner', workspaceName: 'Renamed shelf' },
          cookie,
          'PATCH',
        )
      ).status,
      200,
    );
    assert.equal(
      (await call('/session', null, second.cookie)).data.user.workspaceName,
      'Renamed shelf',
    );
    assert.equal((await call('/access-code', { confirm: 'wrong' }, cookie)).status, 400);
    const rotated = await call('/access-code', { confirm: 'Renamed shelf' }, cookie);
    assert.equal(rotated.status, 200);
    assert.notEqual(rotated.data.token, oldCode);
    assert.equal((await call('/auth', { password: oldCode })).status, 401);
    assert.equal((await call('/auth', { password: rotated.data.token })).status, 200);
    assert.equal((await call('/session', null, second.cookie)).data.user.name, 'Renamed owner');
    const file = await fixture(dir);
    const form = new FormData();
    form.append('deck', new Blob([await readFile(file)]), 'sample.apkg');
    assert.equal((await call('/import', form, cookie)).status, 200);
    const next = (await call('/next', null, cookie)).data.card;
    assert.equal(
      (
        await call(
          '/review',
          { id: next.id, version: next.version, rating: 3, elapsed: 1000 },
          cookie,
        )
      ).status,
      200,
    );
    const before = (await call('/summary', null, cookie)).data;
    assert.equal(before.today.count, 1);
    assert.equal((await call('/progress/reset', { confirm: 'wrong' }, cookie)).status, 400);
    assert.equal((await call('/summary', null, cookie)).data.today.count, 1);
    assert.equal((await call('/progress/reset', { confirm: 'Renamed shelf' }, cookie)).status, 200);
    const after = (await call('/summary', null, cookie)).data;
    assert.equal(after.total, before.total);
    assert.equal(after.today.count, 0);
    assert.equal(after.streak, 0);
    assert.equal(
      after.decks.reduce((n, d) => n + d.new_count, 0),
      3,
    );
    assert.equal(
      (
        await call(
          '/review',
          { id: next.id, version: next.version, rating: 3, elapsed: 1000 },
          cookie,
        )
      ).status,
      409,
    );
  } finally {
    await new Promise((resolve) => {
      child.once('exit', resolve);
      child.kill('SIGTERM');
    });
    await rm(dir, { recursive: true, force: true });
  }
});
