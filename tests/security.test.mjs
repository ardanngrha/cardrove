import test from 'node:test';
import assert from 'node:assert/strict';
import { appCsp } from '../server/security.mjs';
import { readJsonBody } from '../supabase/functions/cardrove-api/request-body.ts';
import { studyShortcut } from '../src/study-shortcuts.ts';

test('review shortcuts grade after reveal even when a button has focus, and ignore unsafe contexts', () => {
  const event = {
    key: '3',
    code: 'Digit3',
    repeat: false,
    isComposing: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    defaultPrevented: false,
  };
  const context = {
    reviewing: true,
    revealed: true,
    blocked: false,
    editing: false,
    nativeActivation: true,
  };
  for (const n of [1, 2, 3, 4])
    assert.equal(studyShortcut({ ...event, key: String(n) }, context), n);
  for (const override of [
    { reviewing: false },
    { revealed: false },
    { blocked: true },
    { editing: true },
  ])
    assert.equal(studyShortcut(event, { ...context, ...override }), null);
  for (const override of [
    { repeat: true },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { isComposing: true },
    { defaultPrevented: true },
  ])
    assert.equal(studyShortcut({ ...event, ...override }, context), null);
  assert.equal(
    studyShortcut(
      { ...event, key: 'Enter', code: 'Enter' },
      { ...context, revealed: false, nativeActivation: false },
    ),
    'reveal',
  );
  assert.equal(
    studyShortcut({ ...event, key: 'Enter', code: 'Enter' }, { ...context, revealed: false }),
    null,
  );
});
test('JSON limits stop reading oversized streams and reject non-object requests', async () => {
  const request = (text) => new Request('https://example.test', { method: 'POST', body: text });
  assert.deepEqual(await readJsonBody(request('{"name":"owner"}')), { name: 'owner' });
  for (const text of ['[]', 'null', '42', 'bad'])
    await assert.rejects(readJsonBody(request(text)), { status: 400 });
  await assert.rejects(readJsonBody(request('é'.repeat(12)), 20), { status: 413 });
  let cancelled = false,
    read = 0;
  const stream = new ReadableStream({
    pull(c) {
      read++;
      c.enqueue(new Uint8Array(50));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    readJsonBody(
      new Request('https://example.test', { method: 'POST', body: stream, duplex: 'half' }),
      70,
    ),
    { status: 413 },
  );
  assert(cancelled);
  assert(read <= 3);
});
test('application CSP pins media and network to the configured backend and denies scripts in object embeds', () => {
  const csp = appCsp('https://example.supabase.co/path');
  assert(csp.includes("script-src 'self' 'wasm-unsafe-eval'"));
  assert(csp.includes("object-src 'none'"));
  assert(csp.includes("frame-ancestors 'none'"));
  assert(csp.includes("connect-src 'self' https://example.supabase.co"));
  assert(!csp.includes("'unsafe-eval'"));
  assert(!csp.includes('*'));
});
