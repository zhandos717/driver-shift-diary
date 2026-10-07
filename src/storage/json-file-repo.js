import { readFile, writeFile, rename, open } from 'node:fs/promises';
import { InMemoryTripRepo } from './memory-repo.js';
import { validateTrip, normalizeTrip } from '../domain/trip.js';

// Файл — снимок состояния; все чтения из памяти. Записи сериализуются через
// цепочку промисов, чтобы параллельные запросы не перетирали файл друг другу.
export class JsonFileTripRepo extends InMemoryTripRepo {
  static async open(file, offset) {
    let raw;
    try {
      raw = await readFile(file, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return new JsonFileTripRepo(file, []);
      throw e;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      throw new Error(`cannot parse ${file}: ${e.message}`);
    }
    if (!Array.isArray(data)) throw new Error(`${file}: expected a JSON array`);
    const trips = data.map((t, i) => {
      const errors = validateTrip(t);
      if (errors.length) throw new Error(`${file}: invalid trip #${i} (${t?.id}): ${errors.join('; ')}`);
      return normalizeTrip(t, offset);
    });
    return new JsonFileTripRepo(file, trips);
  }

  constructor(file, trips) {
    super(trips);
    this.file = file;
    this.queue = Promise.resolve();
  }

  async insertIfAbsent(trip, day) {
    if (!(await super.insertIfAbsent(trip, day))) return false;
    try {
      await this.#persist();
    } catch (e) {
      this.byId.delete(trip.id);
      throw e;
    }
    return true;
  }

  #persist() {
    const snapshot = JSON.stringify(this.all(), null, 2);
    const run = this.queue.then(() => writeAtomic(this.file, snapshot));
    this.queue = run.catch(() => {});
    return run;
  }

  flush() {
    return this.queue;
  }
}

async function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, data);
  const fh = await open(tmp, 'r');
  try { await fh.sync(); } finally { await fh.close(); }
  await rename(tmp, file);
}
