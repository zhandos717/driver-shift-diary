import http from 'node:http';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TripStore, summarize } from './trips.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function createApp(store) {
  const send = (res, code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(readFileSync(join(root, 'public/index.html')));
      }
      if (req.method === 'GET' && url.pathname === '/api/days') return send(res, 200, { days: store.days() });
      if (req.method === 'GET' && url.pathname === '/api/trips') {
        const date = url.searchParams.get('date');
        if (!DAY.test(date ?? '')) return send(res, 400, { errors: ['date: YYYY-MM-DD required'] });
        const trips = store.forDay(date);
        return send(res, 200, { date, summary: summarize(trips), trips });
      }
      if (req.method === 'POST' && url.pathname === '/api/trips') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        let body;
        try { body = JSON.parse(raw); } catch { return send(res, 400, { errors: ['invalid JSON'] }); }
        const r = store.add(body);
        if (r.status === 'invalid') return send(res, 422, { errors: r.errors });
        if (r.status === 'conflict') return send(res, 409, { errors: [`trip ${r.trip.id} already exists with different data`], trip: r.trip });
        return send(res, r.status === 'created' ? 201 : 200, { trip: r.trip, duplicate: r.status === 'duplicate' });
      }
      send(res, 404, { errors: ['not found'] });
    } catch (e) {
      console.error(e);
      send(res, 500, { errors: ['internal error'] });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.env.TRIPS_FILE ?? join(root, 'data/trips.json');
  const initial = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  const store = new TripStore(initial, (trips) => {
    writeFileSync(file + '.tmp', JSON.stringify(trips, null, 2));
    renameSync(file + '.tmp', file);
  });
  const port = Number(process.env.PORT ?? 3000);
  createApp(store).listen(port, () => console.log(`http://localhost:${port}`));
}
