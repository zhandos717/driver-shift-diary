const ISO_WITH_OFFSET = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// Поездка относится к дню водителя по локальной дате начала (как записано в start),
// а не по UTC: иначе ночные поездки в +05:00 уезжают в предыдущий день.
export const localDay = (iso) => iso.slice(0, 10);

export function validateTrip(t) {
  const errors = [];
  if (!t || typeof t !== 'object') return ['body must be a JSON object'];
  if (typeof t.id !== 'string' || !t.id.trim()) errors.push('id: required non-empty string');
  for (const f of ['start', 'end']) {
    if (typeof t[f] !== 'string' || !ISO_WITH_OFFSET.test(t[f]) || Number.isNaN(Date.parse(t[f])))
      errors.push(`${f}: ISO 8601 datetime with offset required`);
  }
  if (!errors.some((e) => e.startsWith('start') || e.startsWith('end')) && Date.parse(t.end) <= Date.parse(t.start))
    errors.push('end: must be later than start');
  if (!Number.isInteger(t.amount) || t.amount <= 0) errors.push('amount: integer > 0 required');
  if (!['cash', 'card'].includes(t.payment)) errors.push('payment: "cash" or "card"');
  if (!Number.isInteger(t.commission) || t.commission < 0) errors.push('commission: integer >= 0 required');
  else if (Number.isInteger(t.amount) && t.commission > t.amount) errors.push('commission: cannot exceed amount');
  return errors;
}

const normalize = ({ id, start, end, amount, payment, commission }) => ({ id, start, end, amount, payment, commission });

const sameTrip = (a, b) =>
  a.amount === b.amount && a.payment === b.payment && a.commission === b.commission &&
  Date.parse(a.start) === Date.parse(b.start) && Date.parse(a.end) === Date.parse(b.end);

export function summarize(trips) {
  const s = { count: 0, revenue: 0, commission: 0, net: 0, cash: { count: 0, amount: 0 }, card: { count: 0, amount: 0 } };
  for (const t of trips) {
    s.count++;
    s.revenue += t.amount;
    s.commission += t.commission;
    s[t.payment].count++;
    s[t.payment].amount += t.amount;
  }
  s.net = s.revenue - s.commission;
  return s;
}

export class TripStore {
  constructor(trips = [], onChange = () => {}) {
    this.byId = new Map(trips.map((t) => [t.id, normalize(t)]));
    this.onChange = onChange;
  }

  all() {
    return [...this.byId.values()];
  }

  forDay(day) {
    return this.all()
      .filter((t) => localDay(t.start) === day)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }

  days() {
    return [...new Set(this.all().map((t) => localDay(t.start)))].sort();
  }

  // created — новая запись; duplicate — та же поездка уже есть (идемпотентно);
  // conflict — тот же id, но другие данные.
  add(input) {
    const errors = validateTrip(input);
    if (errors.length) return { status: 'invalid', errors };
    const trip = normalize(input);
    const existing = this.byId.get(trip.id);
    if (existing) return sameTrip(existing, trip) ? { status: 'duplicate', trip: existing } : { status: 'conflict', trip: existing };
    this.byId.set(trip.id, trip);
    this.onChange(this.all());
    return { status: 'created', trip };
  }
}
