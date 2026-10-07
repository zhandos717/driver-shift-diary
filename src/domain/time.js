const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|([+-])(\d{2}):(\d{2}))$/;
export const DEFAULT_OFFSET = '+05:00';

const pad = (n) => String(n).padStart(2, '0');

export function parseOffset(offset) {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!m || +m[2] > 14 || +m[3] > 59) throw new Error(`invalid offset: ${offset}`);
  return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]);
}

export function isCalendarDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

// Date.parse молча переносит 2026-02-31 на 3 марта и принимает 24:00, поэтому разбираем сами.
export function parseInstant(s) {
  const m = typeof s === 'string' && ISO.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, sec = '00', , sign, oh, om] = m;
  if (!isCalendarDate(`${y}-${mo}-${d}`) || +h > 23 || +mi > 59 || +sec > 59) return null;
  if (sign && (+oh > 14 || +om > 59)) return null;
  const offsetMin = sign ? (sign === '-' ? -1 : 1) * (+oh * 60 + +om) : 0;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec) - offsetMin * 60_000;
}

export function formatInstant(ms, offset) {
  const d = new Date(ms + parseOffset(offset) * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}${offset}`;
}

export const localDay = (iso) => iso.slice(0, 10);
