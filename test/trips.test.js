import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TripStore, summarize, validateTrip } from '../src/trips.js';
import { createApp } from '../src/server.js';

const t1 = { id: 't1', start: '2026-10-01T08:10:00+05:00', end: '2026-10-01T08:32:00+05:00', amount: 2400, payment: 'card', commission: 360 };
const t2 = { id: 't2', start: '2026-10-01T09:05:00+05:00', end: '2026-10-01T09:20:00+05:00', amount: 1500, payment: 'cash', commission: 225 };

test('summary: totals, net and cash/card split', () => {
  assert.deepEqual(summarize([t1, t2]), {
    count: 2, revenue: 3900, commission: 585, net: 3315,
    cash: { count: 1, amount: 1500 }, card: { count: 1, amount: 2400 },
  });
});

test('summary: empty day is all zeros', () => {
  assert.deepEqual(summarize([]), { count: 0, revenue: 0, commission: 0, net: 0, cash: { count: 0, amount: 0 }, card: { count: 0, amount: 0 } });
});

test('day grouping uses local date from start, not UTC', () => {
  // 01:30 +05:00 = 20:30 UTC предыдущего дня
  const night = { ...t1, id: 'n', start: '2026-10-02T01:30:00+05:00', end: '2026-10-02T01:50:00+05:00' };
  const s = new TripStore([t1, night]);
  assert.deepEqual(s.forDay('2026-10-02').map((t) => t.id), ['n']);
  assert.deepEqual(s.forDay('2026-10-01').map((t) => t.id), ['t1']);
});

test('validation', () => {
  assert.deepEqual(validateTrip(t1), []);
  assert.match(validateTrip({ ...t1, amount: 0 }).join(), /amount/);
  assert.match(validateTrip({ ...t1, amount: -5 }).join(), /amount/);
  assert.match(validateTrip({ ...t1, end: t1.start }).join(), /later than start/);
  assert.match(validateTrip({ ...t1, end: '2026-10-01T07:00:00+05:00' }).join(), /later than start/);
  assert.match(validateTrip({ ...t1, payment: 'crypto' }).join(), /payment/);
  assert.match(validateTrip({ ...t1, commission: 9999 }).join(), /exceed/);
  assert.match(validateTrip({ ...t1, start: '2026-10-01 08:10' }).join(), /start/);
});

test('dedup: same trip twice is stored once', () => {
  const s = new TripStore();
  assert.equal(s.add(t1).status, 'created');
  assert.equal(s.add({ ...t1 }).status, 'duplicate');
  assert.equal(s.all().length, 1);
});

test('dedup: same instant in another offset is still the same trip', () => {
  const s = new TripStore([t1]);
  const r = s.add({ ...t1, start: '2026-10-01T03:10:00Z', end: '2026-10-01T03:32:00Z' });
  assert.equal(r.status, 'duplicate');
  assert.equal(s.all().length, 1);
});

test('dedup: same id with different data is a conflict and does not overwrite', () => {
  const s = new TripStore([t1]);
  assert.equal(s.add({ ...t1, amount: 9999 }).status, 'conflict');
  assert.equal(s.all()[0].amount, 2400);
});

test('dedup: persistence callback fires only on real insert', () => {
  let writes = 0;
  const s = new TripStore([], () => writes++);
  s.add(t1); s.add(t1); s.add({ ...t1, amount: 9999 });
  assert.equal(writes, 1);
});

test('HTTP: POST is idempotent, GET returns day summary', async (t) => {
  const server = createApp(new TripStore()).listen(0);
  t.after(() => server.close());
  const base = `http://localhost:${server.address().port}`;
  const post = (b) => fetch(base + '/api/trips', { method: 'POST', body: JSON.stringify(b) });

  assert.equal((await post(t1)).status, 201);
  const again = await post(t1);
  assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);
  assert.equal((await post({ ...t1, amount: 9999 })).status, 409);
  assert.equal((await post({ ...t2, amount: 0 })).status, 422);
  assert.equal((await post(t2)).status, 201);

  const day = await (await fetch(base + '/api/trips?date=2026-10-01')).json();
  assert.equal(day.trips.length, 2);
  assert.equal(day.summary.net, 3315);
  assert.equal((await fetch(base + '/api/trips?date=bad')).status, 400);
});
