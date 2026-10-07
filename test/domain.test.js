import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../src/domain/summary.js';
import { validateTrip } from '../src/domain/trip.js';
import { parseInstant, isCalendarDate } from '../src/domain/time.js';
import { TripService, ValidationError } from '../src/domain/trip-service.js';
import { InMemoryTripRepo } from '../src/storage/memory-repo.js';
import { t1, t2, emptySummary } from './fixtures.js';

const service = (trips = []) => new TripService(new InMemoryTripRepo(trips), { offset: '+05:00' });

describe('summary', () => {
  test('totals, net and cash/card split', () => {
    assert.deepEqual(summarize([t1, t2]), {
      count: 2, revenue: 3900, commission: 585, net: 3315,
      cash: { count: 1, amount: 1500 }, card: { count: 1, amount: 2400 },
    });
  });

  test('empty day is all zeros', () => {
    assert.deepEqual(summarize([]), emptySummary);
  });

  test('only one payment type', () => {
    const s = summarize([t2, { ...t2, id: 'x', amount: 500, commission: 0 }]);
    assert.deepEqual([s.count, s.revenue, s.net, s.cash.amount, s.card.count], [2, 2000, 1775, 2000, 0]);
  });
});

describe('time', () => {
  test('calendar validity, not just format', () => {
    assert.equal(parseInstant('2026-02-31T10:00:00+05:00'), null);
    assert.equal(parseInstant('2026-10-01T24:00:00+05:00'), null);
    assert.equal(parseInstant('2026-10-01T10:60:00+05:00'), null);
    assert.equal(parseInstant('2026-10-01 08:10'), null);
    assert.equal(parseInstant('2026-10-01T08:10:00'), null, 'offset is required');
    assert.equal(parseInstant('2028-02-29T10:00+05:00'), Date.parse('2028-02-29T10:00:00+05:00'));
    assert.equal(isCalendarDate('2026-02-31'), false);
    assert.equal(isCalendarDate('2026-02-28'), true);
  });
});

describe('validation', () => {
  const err = (patch) => validateTrip({ ...t1, ...patch }).join();

  test('valid trip has no errors', () => assert.deepEqual(validateTrip(t1), []));
  test('amount > 0, safe integer, bounded', () => {
    for (const amount of [0, -5, 1.5, 1e300, '2400']) assert.match(err({ amount }), /amount/, String(amount));
  });
  test('end later than start, at most 24h', () => {
    assert.match(err({ end: t1.start }), /later than start/);
    assert.match(err({ end: '2026-10-01T07:00:00+05:00' }), /later than start/);
    assert.match(err({ end: '2026-10-03T08:10:00+05:00' }), /24h/);
    assert.match(err({ start: '2026-02-31T08:10:00+05:00' }), /start/);
  });
  test('payment, commission, id', () => {
    assert.match(err({ payment: 'crypto' }), /payment/);
    assert.match(err({ commission: 9999 }), /exceed/);
    assert.match(err({ commission: -1 }), /commission/);
    assert.match(err({ id: 't1 ' }), /id/);
    assert.match(err({ id: 'x'.repeat(65) }), /id/);
  });
  test('non-object body', () => {
    assert.deepEqual(validateTrip(null), ['body must be a JSON object']);
    assert.deepEqual(validateTrip([t1]), ['body must be a JSON object']);
  });
});

describe('day grouping', () => {
  test('trip across midnight belongs to the day it started', async () => {
    const s = service();
    await s.add(t1);
    await s.add({ ...t1, id: 'n', start: '2026-10-01T23:40:00+05:00', end: '2026-10-02T00:05:00+05:00' });
    assert.deepEqual((await s.dayReport('2026-10-01')).trips.map((t) => t.id), ['t1', 'n']);
    assert.deepEqual((await s.dayReport('2026-10-02')).trips, []);
  });

  test('time sent in UTC is normalized to driver offset', async () => {
    const s = service();
    const r = await s.add({ ...t1, id: 'u', start: '2026-10-01T20:30:00Z', end: '2026-10-01T20:50:00Z' });
    assert.equal(r.trip.start, '2026-10-02T01:30:00+05:00');
    assert.deepEqual((await s.dayReport('2026-10-02')).trips.map((t) => t.id), ['u']);
    assert.deepEqual(await s.days(), ['2026-10-02']);
  });
});

describe('dedup', () => {
  test('same trip twice is stored once', async () => {
    const s = service();
    assert.equal((await s.add(t1)).status, 'created');
    assert.equal((await s.add({ ...t1 })).status, 'duplicate');
    assert.equal(s.repo.all().length, 1);
  });

  test('same instants in another offset are the same trip', async () => {
    const s = service();
    await s.add(t1);
    const r = await s.add({ ...t1, start: '2026-10-01T03:10:00Z', end: '2026-10-01T03:32:00Z' });
    assert.equal(r.status, 'duplicate');
    assert.equal(r.trip.start, t1.start);
  });

  test('same id with different data is a conflict and does not overwrite', async () => {
    const s = service();
    await s.add(t1);
    assert.equal((await s.add({ ...t1, amount: 9999 })).status, 'conflict');
    assert.equal(s.repo.all()[0].amount, 2400);
  });

  test('concurrent submissions of one trip create one record', async () => {
    const s = service();
    const results = await Promise.all(Array.from({ length: 10 }, () => s.add(t1)));
    assert.equal(results.filter((r) => r.status === 'created').length, 1);
    assert.equal(s.repo.all().length, 1);
  });

  test('invalid input throws ValidationError and stores nothing', async () => {
    const s = service();
    await assert.rejects(s.add({ ...t1, amount: 0 }), ValidationError);
    assert.equal(s.repo.all().length, 0);
  });
});
