import { localDay, parseInstant } from '../domain/time.js';

// Контракт репозитория (его же реализует JsonFileTripRepo, а в проде — SQL с UNIQUE(id)):
//   insertIfAbsent(trip, day) -> bool   атомарная проверка и вставка
//   findById(id), findByDay(day), days(), all()
export class InMemoryTripRepo {
  constructor(trips = []) {
    this.byId = new Map();
    for (const t of trips) {
      if (this.byId.has(t.id)) throw new Error(`duplicate trip id in data: ${t.id}`);
      this.byId.set(t.id, t);
    }
  }

  async insertIfAbsent(trip) {
    if (this.byId.has(trip.id)) return false;
    this.byId.set(trip.id, trip);
    return true;
  }

  async findById(id) {
    return this.byId.get(id) ?? null;
  }

  async findByDay(day) {
    return this.all()
      .filter((t) => localDay(t.start) === day)
      .sort((a, b) => parseInstant(a.start) - parseInstant(b.start));
  }

  async days() {
    return [...new Set(this.all().map((t) => localDay(t.start)))].sort();
  }

  all() {
    return [...this.byId.values()];
  }
}
