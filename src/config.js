import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseOffset, DEFAULT_OFFSET } from './domain/time.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(env = process.env) {
  const config = {
    port: Number(env.PORT ?? 3000),
    tripsFile: env.TRIPS_FILE ?? join(root, 'data/trips.json'),
    driverOffset: env.DRIVER_OFFSET ?? DEFAULT_OFFSET,
    maxBodyBytes: Number(env.MAX_BODY_BYTES ?? 16 * 1024),
    indexHtmlPath: join(root, 'public/index.html'),
  };
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) throw new Error(`PORT: invalid value ${env.PORT}`);
  if (!Number.isInteger(config.maxBodyBytes) || config.maxBodyBytes <= 0) throw new Error(`MAX_BODY_BYTES: invalid value`);
  parseOffset(config.driverOffset);
  return config;
}
