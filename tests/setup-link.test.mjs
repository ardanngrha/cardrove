import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const script = resolve(import.meta.dirname, '../scripts/create-connect-token.mjs');
test('private first-device link matches its SQL hash and never appears in console output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cardrove-setup-'));
  try {
    const output = execFileSync(
      process.execPath,
      [script, '--app-url', 'https://example.pages.dev/'],
      { cwd: dir, encoding: 'utf8' },
    );
    const setup = join(dir, 'work/setup');
    const link = new URL(readFileSync(join(setup, 'setup-link.txt'), 'utf8').trim());
    const token = new URLSearchParams(link.hash.slice(1)).get('setup');
    assert.equal(link.origin, 'https://example.pages.dev');
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal(readFileSync(join(setup, 'connect-code.txt'), 'utf8').trim(), token);
    assert.ok(
      readFileSync(join(setup, 'setup.sql'), 'utf8').includes(
        createHash('sha256').update(token).digest('hex'),
      ),
    );
    assert.ok(!output.includes(token));
    assert.equal(statSync(setup).mode & 0o777, 0o700);
    assert.equal(statSync(join(setup, 'setup-link.txt')).mode & 0o777, 0o600);
    execFileSync(
      process.execPath,
      [script, '--app-url', 'https://example.pages.dev/', '--recover'],
      { cwd: dir },
    );
    const recovery = readFileSync(join(setup, 'setup.sql'), 'utf8');
    assert.match(recovery, /DELETE FROM public\.myanki_access WHERE singleton=true/);
    assert.match(
      recovery,
      /UPDATE public\.myanki_workspace SET access_saved=false WHERE singleton=true/,
    );
    assert.ok(!recovery.includes('myanki_cards'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('setup tooling rejects unsafe destinations and has a side-effect-free help command', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cardrove-setup-'));
  try {
    for (const url of [
      'http://example.com',
      'https://user:password@example.com',
      'https://example.com/#secret',
      'https://example.com/?key=secret',
      'javascript:alert(1)',
    ]) {
      assert.equal(spawnSync(process.execPath, [script, '--app-url', url], { cwd: dir }).status, 1);
    }
    assert.equal(spawnSync(process.execPath, [script, '--help'], { cwd: dir }).status, 0);
    assert.equal(existsSync(join(dir, 'work')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
