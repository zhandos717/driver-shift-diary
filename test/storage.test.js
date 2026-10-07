import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileTripRepo } from '../src/storage/json-file-repo.js';
import { TripService } from '../src/domain/trip-service.js';
import { t1, t2 } from './fixtures.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'trips-'));
const OFFSET = '+05:00';

test('missing file starts empty', async () => {
  const repo = await JsonFileTripRepo.open(join(tmp(), 'none.json'), OFFSET);
  assert.deepEqual(await repo.days(), []);
});

test('invalid file content fails fast with a clear message', async () => {
  const dir = tmp();
  const cases = { 'bad.json': ['{oops', /cannot parse/], 'obj.json': ['{}', /JSON array/],
    'trip.json': [JSON.stringify([{ ...t1, payment: 'crypto' }]), /invalid trip #0/],
    'dup.json': [JSON.stringify([t1, t1]), /duplicate trip id/] };
  for (const [name, [content, error]] of Object.entries(cases)) {
    writeFileSync(join(dir, name), content);
    await assert.rejects(JsonFileTripRepo.open(join(dir, name), OFFSET), error, name);
  }
});

test('inserts survive restart; duplicates are not written', async () => {
  const file = join(tmp(), 'trips.json');
  const s = new TripService(await JsonFileTripRepo.open(file, OFFSET), { offset: OFFSET });
  await Promise.all([s.add(t1), s.add(t1), s.add(t2)]);
  await s.repo.flush();
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).map((t) => t.id).sort(), ['t1', 't2']);
  assert.equal((await JsonFileTripRepo.open(file, OFFSET)).all().length, 2);
});

test('failed write rolls back the in-memory insert', { skip: process.getuid?.() === 0 }, async () => {
  const dir = tmp();
  const repo = await JsonFileTripRepo.open(join(dir, 'trips.json'), OFFSET);
  chmodSync(dir, 0o500);
  try {
    await assert.rejects(new TripService(repo, { offset: OFFSET }).add(t1));
    assert.equal(repo.all().length, 0);
  } finally {
    chmodSync(dir, 0o700);
  }
});
