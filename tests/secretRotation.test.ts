import assert from 'node:assert/strict';
import { SecretRotationService, SECRET_ROTATION_DEFAULT_POLICY } from '../src/services/secretRotation.ts';
import type { SecretStoreBackend } from '../src/services/secretRotation.ts';
import type { SecretKind, SecretRecord, RotationEvent } from '../src/types/secrets.ts';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): void {
  Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    })
    .catch((err) => {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error(err);
    });
}

function fixedClock(start = 1_000_000): () => number {
  let t = start;
  return () => t;
}

async function run(): Promise<void> {
  console.log('SecretRotationService unit tests');

  test('registers a secret with active status and one version', async () => {
    const svc = new SecretRotationService({ clock: fixedClock() });
    const rec = await svc.register('db.main', 'database-credential', {
      initialValue: 'v1-secret',
    });
    assert.equal(rec.status, 'active');
    assert.equal(rec.versions.length, 1);
    assert.equal(rec.versions[0].value, 'v1-secret');
    const value = await svc.getSecret('db.main');
    assert.equal(value, 'v1-secret');
  });

  test('rejects duplicate registration (idempotent)', async () => {
    const svc = new SecretRotationService({ clock: fixedClock() });
    await svc.register('api.x', 'api-key', { initialValue: 'a' });
    const again = await svc.register('api.x', 'api-key', { initialValue: 'b' });
    assert.equal(again.versions.length, 1);
    assert.equal(await svc.getSecret('api.x'), 'a');
  });

  test('rotates secret and keeps previous version during overlap (zero-downtime)', async () => {
    let t = 1_000_000;
    const svc = new SecretRotationService({
      clock: () => t,
      policy: { rotationIntervalMs: 1000, overlapMs: 500 },
      generator: { generate: (_k, key) => `${key}-${t}` },
    });
    await svc.register('db.main', 'database-credential', { initialValue: 'old' });
    await svc.rotate('db.main', 'new');
    const rec = await svc.getSecret('db.main');
    assert.equal(rec, 'new');
    assert.equal(await svc.isValidSecret('db.main', 'old'), true);
    assert.equal(await svc.isValidSecret('db.main', 'new'), true);
  });

  test('deactivates old version after overlap window passes', async () => {
    let t = 1_000_000;
    const svc = new SecretRotationService({
      clock: () => t,
      policy: { rotationIntervalMs: 1000, overlapMs: 500, maxVersions: 3 },
      generator: { generate: (_k, key) => `${key}-${t}` },
    });
    await svc.register('db.main', 'database-credential', { initialValue: 'old' });
    t += 1000; // create new version at later time
    await svc.rotate('db.main', 'new');
    t += 600; // beyond overlap of old version
    const rec = (await svc.register('db.main', 'database-credential')) as SecretRecord;
    assert.equal(rec.versions.length, 1);
    assert.equal(rec.versions[0].value, 'new');
    assert.equal(await svc.isValidSecret('db.main', 'old'), false);
    assert.equal(await svc.isValidSecret('db.main', 'new'), true);
  });

  test('enforces maxVersions cap', async () => {
    let t = 0;
    const svc = new SecretRotationService({
      clock: () => t,
      policy: { rotationIntervalMs: 1000, overlapMs: 5000, maxVersions: 2 },
      generator: { generate: (_k, key) => `${key}-${t}` },
    });
    await svc.register('k', 'api-key', { initialValue: 'v0' });
    t += 1000;
    await svc.rotate('k');
    t += 1000;
    await svc.rotate('k');
    const rec = await svc.register('k', 'api-key');
    assert.ok(rec.versions.length <= 2, `expected <=2 got ${rec.versions.length}`);
    assert.equal(await svc.getSecret('k'), 'k-2000');
  });

  test('emits rotation lifecycle events', async () => {
    const events: RotationEvent[] = [];
    const svc = new SecretRotationService({ clock: fixedClock(), generator: { generate: () => 'gen' } });
    svc.on((e) => events.push(e));
    await svc.register('k', 'token', { initialValue: 'a' });
    await svc.rotate('k', 'b');
    assert.ok(events.some((e) => e.type === 'rotation:started'));
    assert.ok(events.some((e) => e.type === 'rotation:completed'));
  });

  test('emits expiry event and marks expired', async () => {
    let t = 1_000_000;
    const events: RotationEvent[] = [];
    const svc = new SecretRotationService({
      clock: () => t,
      policy: { rotationIntervalMs: 1000, overlapMs: 500 },
      generator: { generate: () => 'x' },
    });
    svc.on((e) => events.push(e));
    await svc.register('k', 'token', { initialValue: 'a' });
    t += 2000; // well past expiry + overlap
    const evs = await svc.evaluateExpiry();
    assert.ok(evs.some((e) => e.type === 'secret:expired'));
    assert.ok(events.some((e) => e.type === 'secret:expired'));
  });

  test('emits expiring warning within overlap window', async () => {
    let t = 1_000_000;
    const svc = new SecretRotationService({
      clock: () => t,
      policy: { rotationIntervalMs: 1000, overlapMs: 500 },
      generator: { generate: () => 'x' },
    });
    const events: RotationEvent[] = [];
    svc.on((e) => events.push(e));
    await svc.register('k', 'token', { initialValue: 'a' });
    t += 800; // within overlap window of 500 (1000-800=200<=500)
    await svc.evaluateExpiry();
    assert.ok(events.some((e) => e.type === 'secret:expiring'));
  });

  test('revoke removes all versions and blocks validation', async () => {
    const svc = new SecretRotationService({ clock: fixedClock(), generator: { generate: () => 'x' } });
    await svc.register('k', 'token', { initialValue: 'a' });
    await svc.revoke('k');
    assert.equal(await svc.getSecret('k'), null);
    assert.equal(await svc.isValidSecret('k', 'a'), false);
  });

  test('throws when rotating unregistered secret', async () => {
    const svc = new SecretRotationService({ clock: fixedClock() });
    await assert.rejects(() => svc.rotate('missing'));
  });

  test('tracks metrics (rotations, active, expired)', async () => {
    const svc = new SecretRotationService({ clock: fixedClock(), generator: { generate: () => 'x' } });
    await svc.register('a', 'api-key', { initialValue: '1' });
    await svc.rotate('a', '2');
    const m = svc.getMetrics();
    assert.equal(m.totalRotations, 1);
    assert.equal(m.activeSecrets, 1);
    assert.equal(m.failedRotations, 0);
  });

  test('persists through custom backend', async () => {
    const store = new Map<string, SecretRecord>();
    const backend: SecretStoreBackend = {
      read: (key) => store.get(key) ?? null,
      write: (rec) => {
        store.set(rec.key, rec);
      },
      list: () => Array.from(store.keys()),
    };
    const svc = new SecretRotationService({ clock: fixedClock(), backend });
    await svc.register('k', 'api-key', { initialValue: 'v' });
    const reloaded = await svc.getSecret('k');
    assert.equal(reloaded, 'v');
    assert.ok(store.has('k'));
  });

  test('default policy is defined with sane intervals', () => {
    assert.ok(SECRET_ROTATION_DEFAULT_POLICY.rotationIntervalMs > 0);
    assert.ok(SECRET_ROTATION_DEFAULT_POLICY.maxVersions >= 1);
    assert.ok(SECRET_ROTATION_DEFAULT_POLICY.overlapMs >= 0);
  });
}

void run().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
