import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { HttpError } from './errors.js';
import { readJson } from './body.js';
import { ValidationError } from '../domain/trip-service.js';
import { isCalendarDate } from '../domain/time.js';

const STATUS_BY_RESULT = { created: 201, duplicate: 200 };

export function createApp(service, { indexHtmlPath, maxBodyBytes = 16 * 1024, log = () => {} }) {
  const json = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  };

  const routes = {
    '/': {
      GET: async (req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
        res.end(await readFile(indexHtmlPath));
      },
    },
    '/healthz': { GET: async (req, res) => json(res, 200, { status: 'ok' }) },
    '/api/days': {
      GET: async (req, res) => json(res, 200, { days: await service.days(), offset: service.offset }),
    },
    '/api/trips': {
      GET: async (req, res, url) => {
        const date = url.searchParams.get('date');
        if (!isCalendarDate(date)) throw new HttpError(400, 'date: valid YYYY-MM-DD required');
        json(res, 200, await service.dayReport(date));
      },
      POST: async (req, res) => {
        const r = await service.add(await readJson(req, maxBodyBytes));
        if (r.status === 'conflict') throw new HttpError(409, `trip ${r.trip.id} already exists with different data`, { trip: r.trip });
        json(res, STATUS_BY_RESULT[r.status], { trip: r.trip, duplicate: r.status === 'duplicate' });
      },
    },
  };

  return http.createServer(async (req, res) => {
    const started = process.hrtime.bigint();
    const url = new URL(req.url, 'http://localhost');
    try {
      const route = routes[url.pathname];
      if (!route) throw new HttpError(404, 'not found');
      const handler = route[req.method];
      if (!handler) {
        res.setHeader('Allow', Object.keys(route).join(', '));
        throw new HttpError(405, 'method not allowed');
      }
      await handler(req, res, url);
    } catch (e) {
      if (e instanceof ValidationError) json(res, 422, { errors: e.errors });
      else if (e instanceof HttpError) {
        if (e.status === 413) res.setHeader('Connection', 'close');
        json(res, e.status, { errors: [e.message], ...e.extra });
      } else {
        log({ level: 'error', msg: e.stack });
        json(res, 500, { errors: ['internal error'] });
      }
    } finally {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      log({ level: 'info', method: req.method, path: url.pathname, status: res.statusCode, ms: +ms.toFixed(1) });
    }
  });
}
