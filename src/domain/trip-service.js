import { validateTrip, normalizeTrip, sameTrip } from './trip.js';
import { summarize } from './summary.js';
import { parseOffset, localDay, isCalendarDate } from './time.js';

export class ValidationError extends Error {
  constructor(errors) { super(errors.join('; ')); this.errors = errors; }
}

// Сценарии приложения поверх репозитория. Репозиторий отвечает за хранение,
// сервис — за правила: нормализацию, идемпотентность, расчёт сводки.
export class TripService {
  constructor(repo, { offset }) {
    parseOffset(offset);
    this.repo = repo;
    this.offset = offset;
  }

  async dayReport(day) {
    if (!isCalendarDate(day)) throw new ValidationError(['date: valid YYYY-MM-DD required']);
    const trips = await this.repo.findByDay(day);
    return { date: day, summary: summarize(trips), trips };
  }

  async days() {
    return this.repo.days();
  }

  // created — новая запись; duplicate — та же поездка уже есть (идемпотентно);
  // conflict — тот же id, но другие данные.
  async add(input) {
    const errors = validateTrip(input);
    if (errors.length) throw new ValidationError(errors);
    const trip = normalizeTrip(input, this.offset);
    const inserted = await this.repo.insertIfAbsent(trip, localDay(trip.start));
    if (inserted) return { status: 'created', trip };
    const existing = await this.repo.findById(trip.id);
    return { status: sameTrip(existing, trip) ? 'duplicate' : 'conflict', trip: existing };
  }
}
