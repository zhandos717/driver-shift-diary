import { parseInstant, formatInstant } from './time.js';

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_MONEY = 10_000_000;
const MAX_DURATION_MS = 24 * 3600_000;
export const PAYMENT_METHODS = ['cash', 'card'];

export function validateTrip(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return ['body must be a JSON object'];
  const errors = [];
  if (typeof t.id !== 'string' || !ID.test(t.id)) errors.push('id: 1-64 chars of A-Z a-z 0-9 _ -');
  const start = parseInstant(t.start), end = parseInstant(t.end);
  if (start === null) errors.push('start: valid ISO 8601 datetime with offset required');
  if (end === null) errors.push('end: valid ISO 8601 datetime with offset required');
  if (start !== null && end !== null) {
    if (end <= start) errors.push('end: must be later than start');
    else if (end - start > MAX_DURATION_MS) errors.push('end: trip cannot be longer than 24h');
  }
  const money = (v) => Number.isSafeInteger(v) && v <= MAX_MONEY;
  if (!money(t.amount) || t.amount <= 0) errors.push(`amount: integer in 1..${MAX_MONEY} required`);
  if (!PAYMENT_METHODS.includes(t.payment)) errors.push(`payment: one of ${PAYMENT_METHODS.join(', ')}`);
  if (!money(t.commission) || t.commission < 0) errors.push(`commission: integer in 0..${MAX_MONEY} required`);
  else if (money(t.amount) && t.commission > t.amount) errors.push('commission: cannot exceed amount');
  return errors;
}

// Время приводится к смещению водителя: день поездки и отображаемое время
// не должны зависеть от того, в каком поясе клиент прислал данные.
export const normalizeTrip = (t, offset) => ({
  id: t.id,
  start: formatInstant(parseInstant(t.start), offset),
  end: formatInstant(parseInstant(t.end), offset),
  amount: t.amount,
  payment: t.payment,
  commission: t.commission,
});

export const sameTrip = (a, b) =>
  a.start === b.start && a.end === b.end && a.amount === b.amount &&
  a.payment === b.payment && a.commission === b.commission;
