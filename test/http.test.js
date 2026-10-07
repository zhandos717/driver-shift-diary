import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/http/app.js';
import { TripService } from '../src/domain/trip-service.js';
import { InMemoryTripRepo } from '../src/storage/memory-repo.js';
import { loadConfig } from '../src/config.js';
import { t1, t2, emptySummary } from './fixtures.js';

const repo = new InMemoryTripRepo();
const { indexHtmlPath } = loadConfig({});
const server = createApp(new TripService(repo, { offset: '+05:00' }), { indexHtmlPath });
let base;
before(() => new Promise((r) => server.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); })));
after(() => server.close());

const post = (b, headers = { 'Content-Type': 'application/json' }) =>
  fetch(base + '/api/trips', { method: 'POST', headers, body: typeof b === 'string' ? b : JSON.stringify(b) });
const getJson = async (path) => (await fetch(base + path)).json();

test('POST /api/trips: create, idempotent repeat, conflict', async () => {
  assert.equal((await post(t1)).status, 201);
  const again = await post(t1);
  assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);
  const conflict = await post({ ...t1, amount: 9999 });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).trip.amount, 2400);
  assert.equal((await post(t2)).status, 201);
  assert.equal(repo.all().length, 2);
});

test('POST /api/trips: rejects bad input', async () => {
  assert.equal((await post({ ...t2, id: 'z', amount: 0 })).status, 422);
  assert.equal((await post(null)).status, 422);
  assert.equal((await post('{oops')).status, 400);
  assert.equal((await post(t2, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post({ ...t2, pad: 'x'.repeat(20_000) })).status, 413);
});

test('GET /api/trips: day report', async () => {
  const day = await getJson('/api/trips?date=2026-10-01');
  assert.deepEqual(day.trips.map((x) => x.id), ['t1', 't2']);
  assert.equal(day.summary.net, 3315);
  assert.deepEqual((await getJson('/api/trips?date=2026-10-05')).summary, emptySummary);
  assert.equal((await fetch(base + '/api/trips?date=bad')).status, 400);
  assert.equal((await fetch(base + '/api/trips?date=2026-02-31')).status, 400);
});

test('routing and service endpoints', async () => {
  const put = await fetch(base + '/api/trips', { method: 'PUT' });
  assert.equal(put.status, 405);
  assert.equal(put.headers.get('allow'), 'GET, POST');
  assert.equal((await fetch(base + '/nope')).status, 404);
  assert.deepEqual(await getJson('/healthz'), { status: 'ok' });
  assert.deepEqual(await getJson('/api/days'), { days: ['2026-10-01'], offset: '+05:00' });
  assert.match(await (await fetch(base + '/')).text(), /Дневник смен/);
});

test('config validation', () => {
  assert.throws(() => loadConfig({ DRIVER_OFFSET: '+5' }), /offset/);
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT/);
});
